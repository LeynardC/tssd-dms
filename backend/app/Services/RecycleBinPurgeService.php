<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\File;
use App\Models\Folder;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\Storage;

class RecycleBinPurgeService
{
    // BFS over parent_id — used by folder retire/restore/purge so the whole
    // subtree is always treated as one unit, no matter how deep it goes.
    // Pass $allFolders (a program's full folder set, already loaded) to walk
    // it in memory instead of one query per depth level — used when purging
    // or listing many folders at once, so N folders don't cost N query
    // chains. Omit it for a single-folder call site, where one query per
    // level is cheap and there's nothing to batch against.
    public function collectDescendantIds(int $folderId, ?SupportCollection $allFolders = null): array
    {
        $ids = [];
        $frontier = [$folderId];
        while (!empty($frontier)) {
            $children = $allFolders !== null
                ? $allFolders->filter(fn ($f) => in_array($f->parent_id, $frontier, true))->pluck('id')->all()
                : Folder::whereIn('parent_id', $frontier)->pluck('id')->all();
            if (empty($children)) {
                break;
            }
            array_push($ids, ...$children);
            $frontier = $children;
        }
        return $ids;
    }

    // A retired folder only gets its own Recycle Bin row if it WASN'T swept
    // up into its parent's retirement — "my parent is retired" alone isn't
    // enough, since a folder retired independently (its own retired_at
    // doesn't match its parent's) stays its own entry even while nested
    // under a later, unrelated ancestor retirement. Same rule
    // matchingDescendantIds() uses, just checked one level at a time —
    // walking that one-level rule up the tree is equivalent to checking the
    // whole chain, since a cascade always stamps every swept descendant with
    // the exact same timestamp. Same $allFolders convention as
    // collectDescendantIds() above: pass a pre-loaded set (including
    // retired_at) to avoid a lazy $folder->parent query per folder when
    // checking many at once.
    public function isSubtreeRoot(Folder $folder, ?SupportCollection $allFolders = null): bool
    {
        if (is_null($folder->parent_id)) {
            return true;
        }
        $parent = $allFolders !== null ? $allFolders->get($folder->parent_id) : $folder->parent;
        if (!$parent || !$parent->retired) {
            return true;
        }
        // A blank retired_at on either side means there's no timestamp to
        // prove this folder was swept up by the parent's specific cascade —
        // safer to treat it as its own independent entry than to guess two
        // blank timestamps belong together.
        $sameCascade = $parent->retired_at && $folder->retired_at
            && $folder->retired_at->equalTo($parent->retired_at);
        return !$sameCascade;
    }

    // Descendant ids that were swept up by the SAME retirement cascade as
    // $ancestor — their retired_at exactly matches $ancestor's. A descendant
    // with a different retired_at (or a blank one, e.g. from before this
    // timestamp tracking existed) was retired independently, for its own
    // reason, or can't be proven to belong to this cascade, and is excluded
    // here — this is what lets restore() and purge() both leave it alone
    // instead of silently reviving or destroying it as a side effect of
    // $ancestor's fate. Same $allFolders convention as collectDescendantIds()
    // above. If $ancestor itself has no retired_at, nothing can be proven to
    // belong to its cascade, so nothing matches.
    public function matchingDescendantIds(Folder $ancestor, array $descendantIds, ?SupportCollection $allFolders = null): array
    {
        if (empty($descendantIds) || !$ancestor->retired_at) {
            return [];
        }
        if ($allFolders !== null) {
            return $allFolders->whereIn('id', $descendantIds)
                ->filter(fn ($f) => $f->retired && $f->retired_at
                    && $f->retired_at->equalTo($ancestor->retired_at))
                ->pluck('id')->all();
        }
        return Folder::whereIn('id', $descendantIds)
            ->where('retired', true)
            ->where('retired_at', $ancestor->retired_at)
            ->pluck('id')->all();
    }

    // Purges one folder subtree. Thin wrapper around purgeFolders() so
    // there's exactly one implementation of "purge a subtree" — this just
    // calls it with a single root.
    public function purgeFolder(Folder $folder, User $actor): bool
    {
        return $this->purgeFolders(collect([$folder]), $actor)['purged'] === 1;
    }

    // Purges every folder root in $roots in one batched pass, instead of
    // running the single-folder query sequence once per root. For each
    // distinct program_id represented, the whole program's folders and files
    // are loaded exactly once and reused for every root in that program —
    // so N folders in the bin cost one combined read instead of N. Returns
    // ['purged' => int, 'skipped' => int] (skipped = subtree contained a
    // locked file, so nothing in it was touched).
    public function purgeFolders(SupportCollection $roots, User $actor): array
    {
        $purged = 0;
        $skipped = 0;

        foreach ($roots->groupBy('program_id') as $programId => $programRoots) {
            $allFolders = Folder::where('program_id', $programId)
                ->get(['id', 'parent_id', 'retired', 'retired_at'])
                ->keyBy('id');

            $allFiles = File::withTrashed()
                ->where('program_id', $programId)
                ->get(['id', 'folder_id', 'stored_path', 'locked']);

            foreach ($programRoots as $root) {
                $descendantIds = $this->collectDescendantIds($root->id, $allFolders);
                // Only descendants swept up by THIS root's own retirement are
                // purged with it — one independently retired earlier keeps
                // its own fate instead of being destroyed as a side effect
                // of an unrelated ancestor's purge (same rule restore() uses).
                $matchingIds = $this->matchingDescendantIds($root, $descendantIds, $allFolders);
                $subtreeIds = [$root->id, ...$matchingIds];
                $filesInSubtree = $allFiles->whereIn('folder_id', $subtreeIds);

                if ($filesInSubtree->contains(fn ($f) => $f->locked)) {
                    $skipped++;
                    continue;
                }

                foreach ($filesInSubtree as $file) {
                    Storage::disk('local')->delete($file->stored_path);
                }

                // Files must be force-deleted BEFORE the folders — files.folder_id
                // and folders.parent_id both use nullOnDelete(), so deleting
                // folders first would silently null out folder_id on any
                // remaining file instead of removing it, reappearing as a
                // root-level file.
                File::withTrashed()->whereIn('folder_id', $subtreeIds)->forceDelete();

                $fileCount = $filesInSubtree->count();
                $subfolderCount = count($matchingIds);
                [$folderId, $folderName] = [$root->id, $root->name];

                Folder::whereIn('id', $subtreeIds)->delete();

                ActivityLog::record(
                    actor: $actor,
                    action: 'folder.purged',
                    subjectType: 'Folder',
                    subjectId: $folderId,
                    subjectLabel: $folderName,
                    metadata: [
                        'program_id' => $programId,
                        'file_count' => $fileCount,
                        'subfolder_count' => $subfolderCount,
                    ],
                );

                $purged++;
            }
        }

        return ['purged' => $purged, 'skipped' => $skipped];
    }

    public function purgeFile(File $file, User $actor): bool
    {
        if ($file->locked) {
            return false;
        }

        Storage::disk('local')->delete($file->stored_path);
        [$fileId, $fileName, $programId] = [$file->id, $file->original_name, $file->program_id];
        $file->forceDelete();

        ActivityLog::record(
            actor: $actor,
            action: 'file.purged',
            subjectType: 'File',
            subjectId: $fileId,
            subjectLabel: $fileName,
            metadata: ['program_id' => $programId],
        );

        return true;
    }

    // Retired folders that are the root of their subtree — i.e. the actual
    // Recycle Bin rows (a cascaded descendant folder is never its own row).
    // Shared by the bin listing, Empty Bin, and the scheduled sweep. SQL
    // form of the same "same cascade" rule isSubtreeRoot() applies in PHP —
    // the two must agree, or Empty Bin/the scheduled sweep can silently skip
    // a folder that isSubtreeRoot() (and therefore restore()/purge()) treats
    // as its own independent entry. A blank retired_at on either side counts
    // as NOT the same cascade (matches isSubtreeRoot()'s PHP logic) — two
    // legacy, untimestamped retirements are never assumed to belong together.
    public function topLevelFolderQuery(?string $programId = null): Builder
    {
        $query = Folder::where('retired', true)
            ->where(function ($q) {
                $q->whereNull('parent_id')
                    ->orWhereHas('parent', fn ($q2) => $q2->where('retired', false))
                    ->orWhere(function ($q3) {
                        $q3->whereHas('parent', fn ($q4) => $q4->where('retired', true))
                            ->where(function ($q5) {
                                $q5->whereNull('retired_at')
                                    ->orWhereRaw(
                                        'retired_at != (SELECT p.retired_at FROM folders AS p WHERE p.id = folders.parent_id)'
                                    )
                                    ->orWhereRaw(
                                        '(SELECT p.retired_at FROM folders AS p WHERE p.id = folders.parent_id) IS NULL'
                                    );
                            });
                    });
            });
        if ($programId) {
            $query->where('program_id', $programId);
        }
        return $query;
    }

    // Individually soft-deleted files whose folder isn't already part of a
    // retired subtree (those ride along with their folder's own row/purge
    // instead of being double-listed). Shared the same way as above.
    public function topLevelFileQuery(?string $programId = null): Builder
    {
        $query = File::onlyTrashed()
            ->where(function ($q) {
                $q->whereNull('folder_id')
                    ->orWhereHas('folder', fn ($q2) => $q2->where('retired', false));
            });
        if ($programId) {
            $query->where('program_id', $programId);
        }
        return $query;
    }

    public function expiredFolderRoots(int $days = 30): Collection
    {
        return $this->topLevelFolderQuery()->where('retired_at', '<=', now()->subDays($days))->get();
    }

    public function expiredFiles(int $days = 30): Collection
    {
        return $this->topLevelFileQuery()->where('deleted_at', '<=', now()->subDays($days))->get();
    }
}
