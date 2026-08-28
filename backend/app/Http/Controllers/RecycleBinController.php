<?php

namespace App\Http\Controllers;

use App\Models\File;
use App\Models\Folder;
use App\Models\User;
use App\Services\RecycleBinPurgeService;
use Illuminate\Support\Collection;
use Illuminate\Http\Request;

class RecycleBinController extends Controller
{
    private const RETENTION_DAYS = 30;

    public function __construct(private RecycleBinPurgeService $purgeService)
    {
    }

    private function visibleProgramIds(Request $request, ?string $requestedProgramId): array
    {
        $user = $request->user();

        if ($user->hasRole('chief')) {
            if ($requestedProgramId) {
                return [$requestedProgramId];
            }
            // No program_id given: chief sees every program currently
            // represented among folders or (trashed) files.
            return Folder::pluck('program_id')
                ->merge(File::withTrashed()->pluck('program_id'))
                ->unique()
                ->values()
                ->all();
        }

        if (!$requestedProgramId) {
            abort(422, 'program_id is required.');
        }
        if ($requestedProgramId !== $user->assigned_program) {
            abort(403, 'You can only view the Recycle Bin for your assigned program.');
        }
        return [$requestedProgramId];
    }

    // Walks the parent_id chain of $folderId (inclusive) up to root, using an
    // already-loaded flat set — avoids a query per row.
    private function originPath(?int $folderId, Collection $allFolders): string
    {
        $segments = [];
        $current = $folderId ? $allFolders->get($folderId) : null;
        while ($current) {
            array_unshift($segments, $current->name);
            $current = $current->parent_id ? $allFolders->get($current->parent_id) : null;
        }
        return implode(' / ', $segments);
    }

    // $allFolders/$allFiles are already scoped to this one program and
    // pre-loaded by index() — everything here works in memory, no queries.
    private function binItemsForProgram(
        Collection $allFolders,
        Collection $allFiles,
        Collection $deletedByNames,
    ): array {
        $items = [];

        $roots = $allFolders->filter(fn ($f) => $f->retired && $this->purgeService->isSubtreeRoot($f, $allFolders));
        foreach ($roots as $root) {
            $descendantIds = $this->purgeService->collectDescendantIds($root->id, $allFolders);
            $subtreeFolderIds = [$root->id, ...$descendantIds];
            $filesInSubtree = $allFiles->whereIn('folder_id', $subtreeFolderIds);

            $items[] = [
                'type' => 'folder',
                'id' => $root->id,
                'name' => $root->name,
                'origin_path' => $this->originPath($root->parent_id, $allFolders),
                'retired_at' => $root->retired_at?->toIso8601String(),
                'retired_by_name' => $root->retiredBy->name ?? null,
                // Folders retired before this feature existed have no
                // retired_at yet — treat them as unknown/never-expiring
                // rather than crashing; the frontend can flag this state.
                'expires_at' => $root->retired_at
                    ? $root->retired_at->copy()->addDays(self::RETENTION_DAYS)->toIso8601String()
                    : null,
                'subfolder_count' => count($descendantIds),
                'file_count' => $filesInSubtree->count(),
                'has_locked_file' => $filesInSubtree->contains(fn ($f) => $f->locked),
            ];
        }

        // In-memory equivalent of RecycleBinPurgeService::topLevelFileQuery()
        // — a trashed file rides along with its folder's own bin row (not
        // double-listed here) only while that folder is still retired.
        $topLevelFiles = $allFiles->filter(
            fn ($f) => $f->deleted_at !== null
                && (!$f->folder_id || !($allFolders->get($f->folder_id)?->retired ?? false))
        );

        foreach ($topLevelFiles as $file) {
            $items[] = [
                'type' => 'file',
                'id' => $file->id,
                'name' => $file->original_name,
                'origin_path' => $this->originPath($file->folder_id, $allFolders),
                'deleted_at' => $file->deleted_at?->toIso8601String(),
                'deleted_by_name' => $file->deleted_by ? ($deletedByNames[$file->deleted_by] ?? null) : null,
                'expires_at' => $file->deleted_at
                    ? $file->deleted_at->copy()->addDays(self::RETENTION_DAYS)->toIso8601String()
                    : null,
                'size_bytes' => $file->size_bytes,
                'locked' => $file->locked,
            ];
        }

        return $items;
    }

    public function index(Request $request)
    {
        $programIds = $this->visibleProgramIds($request, $request->query('program_id'));

        // Loaded once across every visible program instead of once per
        // program — a chief viewing all programs previously cost ~4-5
        // queries per program; this is a small, fixed number regardless of
        // how many programs are visible.
        $allFoldersByProgram = Folder::whereIn('program_id', $programIds)
            ->with('retiredBy:id,name')
            ->get(['id', 'parent_id', 'program_id', 'retired', 'retired_at', 'retired_by', 'name'])
            ->groupBy('program_id');

        $allFilesByProgram = File::withTrashed()
            ->whereIn('program_id', $programIds)
            ->get(['id', 'folder_id', 'program_id', 'original_name', 'size_bytes', 'locked', 'deleted_at', 'deleted_by'])
            ->groupBy('program_id');

        $deletedByNames = User::whereIn(
            'id',
            $allFilesByProgram->flatten()->pluck('deleted_by')->filter()->unique(),
        )->pluck('name', 'id');

        $items = [];
        foreach ($programIds as $programId) {
            $items = [...$items, ...$this->binItemsForProgram(
                ($allFoldersByProgram->get($programId) ?? collect())->keyBy('id'),
                $allFilesByProgram->get($programId) ?? collect(),
                $deletedByNames,
            )];
        }

        // Folder rows only ever have a 'retired_at' key, file rows only a
        // 'deleted_at' key — reading the other one directly (even via ??)
        // trips "Undefined array key". Pick by type instead, and treat a
        // missing/null timestamp (legacy folders retired before this
        // feature existed) as sorting last rather than crashing.
        $sortKey = fn (array $item): string => ($item['type'] === 'folder'
            ? $item['retired_at']
            : $item['deleted_at']) ?? '';

        usort($items, fn ($a, $b) => strcmp($sortKey($b), $sortKey($a)));

        return response()->json(['items' => $items]);
    }

    public function emptyBin(Request $request)
    {
        $validated = $request->validate([
            'program_id' => ['required', 'string'],
        ]);
        $programId = $validated['program_id'];

        $user = $request->user();
        if (!$user->hasRole('chief') && $programId !== $user->assigned_program) {
            abort(403, 'You can only manage the Recycle Bin for your assigned program.');
        }

        $folderResult = $this->purgeService->purgeFolders(
            $this->purgeService->topLevelFolderQuery($programId)->get(),
            $user,
        );
        $purgedFolders = $folderResult['purged'];
        $skippedFolders = $folderResult['skipped'];

        $purgedFiles = $skippedFiles = 0;
        foreach ($this->purgeService->topLevelFileQuery($programId)->get() as $file) {
            $this->purgeService->purgeFile($file, $user) ? $purgedFiles++ : $skippedFiles++;
        }

        return response()->json([
            'purged_folders' => $purgedFolders,
            'purged_files' => $purgedFiles,
            'skipped_locked' => $skippedFolders + $skippedFiles,
        ]);
    }
}
