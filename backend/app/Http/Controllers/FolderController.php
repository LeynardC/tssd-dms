<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use Illuminate\Http\Request;
use App\Models\ActivityLog;
use App\Services\RecycleBinPurgeService;
use Illuminate\Validation\Rule;

class FolderController extends Controller
{
    public function __construct(private RecycleBinPurgeService $purgeService)
    {
    }

    private function canManage(Request $request, string $programId): bool
    {
        $user = $request->user();
        if ($user->hasRole('chief')) {
            return true;
        }
        return $user->assigned_program === $programId;
    }

    public function index(Request $request)
    {
        $programId = $request->query('program_id');
        if (!$programId) {
            abort(422, 'program_id is required.');
        }

        $user = $request->user();
        if (!$user->hasRole('chief') && $user->assigned_program !== $programId) {
            abort(403, 'You can only view folders for your assigned program.');
        }

        $folders = Folder::where('program_id', $programId)
            ->where('retired', false)
            ->orderBy('name')
            ->get();

        return response()->json(['folders' => $folders]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'program_id' => ['required', 'string', Rule::exists('programs', 'code')->where(fn ($q) => $q->where('retired', false))],
            'name' => ['required', 'string', 'max:255'],
            'parent_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        if (!$this->canManage($request, $validated['program_id'])) {
            abort(403, 'You can only manage folders for your assigned program.');
        }

        // Cross-program nesting guard: parent_id existing at all isn't enough —
        // it must belong to the SAME program being submitted, or a staff member
        // could nest their program's folder under a different program's tree.
        if (!empty($validated['parent_id'])) {
            $parent = Folder::find($validated['parent_id']);
            if (!$parent || $parent->program_id !== $validated['program_id']) {
                abort(422, 'The selected parent folder does not belong to this program.');
            }
            if ($parent->retired) {
                abort(422, 'This folder has been retired and can no longer receive new subfolders.');
            }
        }

        $exists = Folder::where('program_id', $validated['program_id'])
            ->where('parent_id', $validated['parent_id'] ?? null)
            ->whereRaw('LOWER(name) = ?', [strtolower($validated['name'])])
            ->where('retired', false)
            ->exists();

        if ($exists) {
            abort(422, 'A folder with that name already exists here.');
        }

        $folder = Folder::create([
            'program_id' => $validated['program_id'],
            'name' => trim($validated['name']),
            'parent_id' => $validated['parent_id'] ?? null,
            'created_by' => $request->user()->id,
            'retired' => false,
        ]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'folder.created',
            subjectType: 'Folder',
            subjectId: $folder->id,
            subjectLabel: $folder->name,
            metadata: ['program_id' => $folder->program_id, 'parent_id' => $folder->parent_id],
        );

        return response()->json(['folder' => $folder], 201);
    }

    public function rename(Request $request, Folder $folder)
    {
        if (!$this->canManage($request, $folder->program_id)) {
            abort(403, 'You can only manage folders for your assigned program.');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $exists = Folder::where('program_id', $folder->program_id)
            ->where('parent_id', $folder->parent_id)
            ->where('id', '!=', $folder->id)
            ->whereRaw('LOWER(name) = ?', [strtolower($validated['name'])])
            ->where('retired', false)
            ->exists();

        if ($exists) {
            abort(422, 'A folder with that name already exists here.');
        }

        $oldName = $folder->name;
        $folder->update(['name' => trim($validated['name'])]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'folder.renamed',
            subjectType: 'Folder',
            subjectId: $folder->id,
            subjectLabel: $folder->name,
            metadata: ['old_name' => $oldName, 'new_name' => $folder->name, 'program_id' => $folder->program_id],
        );

        return response()->json(['folder' => $folder->fresh()]);
    }

    public function retire(Request $request, Folder $folder)
    {
        if (!$this->canManage($request, $folder->program_id)) {
            abort(403, 'You can only manage folders for your assigned program.');
        }
        if ($folder->retired) {
            abort(400, 'This folder is already in the Recycle Bin.');
        }

        // Retiring a folder must hide everything under it too — otherwise a
        // subfolder stays `retired = false` and keeps surfacing its files in
        // the File Explorer, Monitoring, and Search even though its parent
        // is gone from the explorer.
        // Formatted to an explicit microsecond-precision STRING, not passed
        // as a Carbon object — Laravel's query layer reformats any raw
        // DateTimeInterface binding using the database driver's fixed date
        // format when it prepares the query, silently truncating back to
        // whole seconds regardless of the column's precision or the model's
        // own cast format. Passing an already-formatted string bypasses
        // that and is what actually lets two back-to-back retire() calls
        // land on distinct timestamps (see the
        // widen_folder_retired_at_precision migration). Formatted once and
        // reused for both writes below so the whole cascade shares the
        // exact same literal value — matchingDescendantIds() depends on
        // that exact-string match.
        $now = now()->format('Y-m-d H:i:s.u');
        $actorId = $request->user()->id;

        $descendantIds = $this->purgeService->collectDescendantIds($folder->id);
        if (!empty($descendantIds)) {
            // Only stamp descendants that aren't already retired. An
            // already-retired descendant (retired independently, on its own,
            // before this cascade reached it) keeps its own original
            // retired_at untouched — that's what lets restore() later tell
            // "swept up by this cascade" apart from "was already retired for
            // its own reason", instead of silently reviving it.
            Folder::whereIn('id', $descendantIds)
                ->where('retired', false)
                ->update(['retired' => true, 'retired_at' => $now, 'retired_by' => $actorId]);
        }
        $folder->update([
            'retired' => true,
            'retired_at' => $now,
            'retired_by' => $actorId,
        ]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'folder.retired',
            subjectType: 'Folder',
            subjectId: $folder->id,
            subjectLabel: $folder->name,
            metadata: ['program_id' => $folder->program_id],
        );

        return response()->json(['message' => 'Folder retired.']);
    }

    public function restore(Request $request, Folder $folder)
    {
        if (!$this->canManage($request, $folder->program_id)) {
            abort(403, 'You can only manage folders for your assigned program.');
        }
        if (!$folder->retired) {
            abort(400, 'This folder is not in the Recycle Bin.');
        }
        if (!$this->purgeService->isSubtreeRoot($folder)) {
            abort(422, 'This folder is nested inside another retired folder. Restore that folder instead.');
        }

        // Same collision rule store()/rename() enforce for an active folder —
        // restore() must not be able to silently reintroduce a name clash
        // that those two endpoints would have rejected outright.
        $nameTaken = Folder::where('program_id', $folder->program_id)
            ->where('parent_id', $folder->parent_id)
            ->where('id', '!=', $folder->id)
            ->whereRaw('LOWER(name) = ?', [strtolower($folder->name)])
            ->where('retired', false)
            ->exists();

        if ($nameTaken) {
            abort(422, 'A folder with that name already exists here. Rename one of them before restoring.');
        }

        // Restore this folder plus only the descendants that were swept up
        // by THIS folder's own retirement (their retired_at exactly matches
        // this one's, stamped together by retire()'s cascade — or both are
        // null, for folders retired before that timestamp tracking existed).
        // A descendant with a different, earlier retired_at was retired
        // independently for its own reason and stays retired — it becomes
        // its own Recycle Bin entry again instead of being silently revived.
        $descendantIds = $this->purgeService->collectDescendantIds($folder->id);
        $matchingDescendantIds = $this->purgeService->matchingDescendantIds($folder, $descendantIds);
        $restorableIds = [$folder->id, ...$matchingDescendantIds];

        // The check above only covers $folder itself — a descendant coming
        // back with it could just as easily collide with a folder that was
        // created or renamed into its spot while it sat retired. Bulk-check
        // every restored descendant against the program's current active
        // folders in one query instead of one per descendant.
        if (!empty($matchingDescendantIds)) {
            $restoringFolders = Folder::whereIn('id', $matchingDescendantIds)->get(['id', 'parent_id', 'name']);
            $activeFolders = Folder::where('program_id', $folder->program_id)
                ->where('retired', false)
                ->get(['parent_id', 'name']);

            foreach ($restoringFolders as $rf) {
                $clash = $activeFolders->contains(
                    fn ($a) => $a->parent_id === $rf->parent_id && strtolower($a->name) === strtolower($rf->name)
                );
                if ($clash) {
                    abort(422, "A folder with that name already exists here. Rename \"{$rf->name}\" before restoring.");
                }
            }
        }

        Folder::whereIn('id', $restorableIds)->update([
            'retired' => false,
            'retired_at' => null,
            'retired_by' => null,
        ]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'folder.restored',
            subjectType: 'Folder',
            subjectId: $folder->id,
            subjectLabel: $folder->name,
            metadata: ['program_id' => $folder->program_id],
        );

        return response()->json(['folder' => $folder->fresh()]);
    }

    public function purge(Request $request, Folder $folder)
    {
        if (!$this->canManage($request, $folder->program_id)) {
            abort(403, 'You can only manage folders for your assigned program.');
        }
        if (!$folder->retired) {
            abort(400, 'This folder is not in the Recycle Bin.');
        }
        if (!$this->purgeService->isSubtreeRoot($folder)) {
            abort(422, 'This folder is nested inside another retired folder. Delete that folder instead.');
        }

        $purged = $this->purgeService->purgeFolder($folder, $request->user());
        if (!$purged) {
            abort(423, 'This folder contains a locked file and cannot be permanently deleted. Unlock it first.');
        }

        return response()->json(['message' => 'Folder permanently deleted.']);
    }
}
