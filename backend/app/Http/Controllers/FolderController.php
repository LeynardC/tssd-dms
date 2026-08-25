<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use Illuminate\Http\Request;
use App\Models\ActivityLog;

class FolderController extends Controller
{
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
            'program_id' => ['required', 'string'],
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

        $folder->update(['retired' => true]);

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
}
