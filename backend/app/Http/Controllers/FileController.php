<?php

namespace App\Http\Controllers;

use App\Models\File;
use App\Models\ActivityLog;
use App\Services\RecycleBinPurgeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FileController extends Controller
{
    public function __construct(private RecycleBinPurgeService $purgeService)
    {
    }

    // Only these are accepted — checked against the file's real signature,
    // not just its extension, in ALLOWED_MIMES below.
    private const ALLOWED_MIMES = [
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'pdf' => 'application/pdf',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
    ];

    private const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

    // A file inside a retired folder is meant to be hidden — index() and
    // SearchController already exclude it from listings via
    // whereDoesntHave('folder', retired). Direct-by-ID routes (show,
    // download, preview) need the same guard, or a bookmarked/cached file
    // ID still works even though the folder that's supposed to hide it
    // has been retired.
    private function abortIfInRetiredFolder(File $file): void
    {
        if ($file->folder?->retired) {
            abort(404, 'File not found.');
        }
    }

    private function canManageProgram(Request $request, string $programId): bool
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
        $folderId = $request->query('folder_id'); // string "null" or numeric id or absent

        if (!$programId) {
            abort(422, 'program_id is required.');
        }

        $user = $request->user();
        if (!$user->hasRole('chief') && $user->assigned_program !== $programId) {
            abort(403, 'You can only view files for your assigned program.');
        }

        $query = File::where('program_id', $programId)
            ->with('uploader:id,name')
            // A retired folder is hidden from the explorer, so its files
            // must not surface elsewhere either — otherwise "deleting" a
            // folder wouldn't actually remove its data from Monitoring.
            ->whereDoesntHave('folder', fn ($q) => $q->where('retired', true))
            ->orderBy('original_name');

        if ($request->has('folder_id')) {
            if ($folderId === null || $folderId === 'null') {
                $query->whereNull('folder_id');
            } else {
                $query->where('folder_id', $folderId);
            }
        }

        return response()->json(['files' => $query->get()]);
    }

    public function show(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only view files for your assigned program.');
        }
        $this->abortIfInRetiredFolder($file);

        return response()->json(['file' => $file->load('uploader:id,name')]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'program_id' => ['required', 'string', Rule::exists('programs', 'code')->where(fn ($q) => $q->where('retired', false))],
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
            'file' => ['required', 'file', 'max:' . (self::MAX_SIZE_BYTES / 1024)],
            'description' => ['nullable', 'string', 'max:25000'],
            'parsed_data' => ['nullable', 'string'],
        ]);

        if (!$this->canManageProgram($request, $validated['program_id'])) {
            abort(403, 'You can only upload files for your assigned program.');
        }

        if (!empty($validated['folder_id'])) {
            $folder = \App\Models\Folder::find($validated['folder_id']);
            if (!$folder || $folder->program_id !== $validated['program_id']) {
                abort(422, 'The selected folder does not belong to this program.');
            }
            if ($folder->retired) {
                abort(422, 'This folder has been retired and can no longer receive files.');
            }
        }

        $uploaded = $request->file('file');
        $extension = strtolower($uploaded->getClientOriginalExtension());

        if (!array_key_exists($extension, self::ALLOWED_MIMES)) {
            abort(422, "File type .$extension is not allowed. Allowed types: " . implode(', ', array_keys(self::ALLOWED_MIMES)));
        }

        // Check the file's REAL mime type (from its actual binary signature),
        // not just what the browser claims — a renamed .exe to .xlsx would
        // still be caught here, since getMimeType() inspects file content.
        $realMime = $uploaded->getMimeType();
        $expectedMime = self::ALLOWED_MIMES[$extension];
        if ($realMime !== $expectedMime) {
            abort(422, "File content does not match its extension. This file may be mislabeled or unsafe.");
        }

        // Stored outside the public web root, with a random name — never
        // the original filename — so a file can never be directly guessed
        // or requested by URL. Downloads always go through download() below,
        // which checks permissions before streaming the file.
        $storedPath = $uploaded->store('program-files/' . $validated['program_id'], 'local');

        $parsedData = null;
        if (!empty($validated['parsed_data'])) {
            $decoded = json_decode($validated['parsed_data'], true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $parsedData = $decoded;
            }
        }

        $file = File::create([
            'program_id' => $validated['program_id'],
            'folder_id' => $validated['folder_id'] ?? null,
            'original_name' => $uploaded->getClientOriginalName(),
            'stored_path' => $storedPath,
            'mime_type' => $realMime,
            'size_bytes' => $uploaded->getSize(),
            'uploaded_by' => $request->user()->id,
            'description' => $validated['description'] ?? null,
            'parsed_data' => $parsedData,
        ]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'file.uploaded',
            subjectType: 'File',
            subjectId: $file->id,
            subjectLabel: $file->original_name,
            metadata: ['program_id' => $file->program_id, 'folder_id' => $file->folder_id],
        );

        return response()->json(['file' => $file->load('uploader:id,name')], 201);
    }

    public function replace(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        $this->abortIfInRetiredFolder($file);
        if ($file->locked) {
            abort(423, 'This file is locked and cannot be replaced.');
        }

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:' . (self::MAX_SIZE_BYTES / 1024)],
            'parsed_data' => ['nullable', 'string'],
        ]);

        $uploaded = $request->file('file');
        $extension = strtolower($uploaded->getClientOriginalExtension());

        if (!array_key_exists($extension, self::ALLOWED_MIMES)) {
            abort(422, "File type .$extension is not allowed. Allowed types: " . implode(', ', array_keys(self::ALLOWED_MIMES)));
        }

        $realMime = $uploaded->getMimeType();
        $expectedMime = self::ALLOWED_MIMES[$extension];
        if ($realMime !== $expectedMime) {
            abort(422, "File content does not match its extension. This file may be mislabeled or unsafe.");
        }

        $storedPath = $uploaded->store('program-files/' . $file->program_id, 'local');

        $parsedData = null;
        if (!empty($validated['parsed_data'])) {
            $decoded = json_decode($validated['parsed_data'], true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $parsedData = $decoded;
            }
        }

        $oldPath = $file->stored_path;
        $oldSize = $file->size_bytes;
        $oldName = $file->original_name;

        $file->update([
            // The uploaded file's own name, not the old one it's replacing —
            // a data-based replace (matched by period/scope, not filename)
            // can easily carry a different name than what it's overwriting,
            // and the old name would otherwise stay stuck on screen forever.
            'original_name' => $uploaded->getClientOriginalName(),
            'stored_path' => $storedPath,
            'mime_type' => $realMime,
            'size_bytes' => $uploaded->getSize(),
            'parsed_data' => $parsedData,
            'uploaded_by' => $request->user()->id,
        ]);

        Storage::disk('local')->delete($oldPath);

        ActivityLog::record(
            actor: $request->user(),
            action: 'file.replaced',
            subjectType: 'File',
            subjectId: $file->id,
            subjectLabel: $file->original_name,
            metadata: [
                'program_id' => $file->program_id,
                'folder_id' => $file->folder_id,
                'old_name' => $oldName,
                'new_name' => $file->original_name,
                'old_size_bytes' => $oldSize,
                'new_size_bytes' => $file->size_bytes,
            ],
        );

        return response()->json(['file' => $file->fresh()->load('uploader:id,name')]);
    }

    public function download(Request $request, File $file): StreamedResponse
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only download files for your assigned program.');
        }
        $this->abortIfInRetiredFolder($file);

        if (!Storage::disk('local')->exists($file->stored_path)) {
            abort(404, 'File not found on disk.');
        }

        return Storage::disk('local')->download($file->stored_path, $file->original_name);
    }

    public function rename(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        $this->abortIfInRetiredFolder($file);
        if ($file->locked) {
            abort(423, 'This file is locked and cannot be renamed.');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $oldName = $file->original_name;
        $file->update(['original_name' => trim($validated['name'])]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'file.renamed',
            subjectType: 'File',
            subjectId: $file->id,
            subjectLabel: $file->original_name,
            metadata: ['old_name' => $oldName, 'new_name' => $file->original_name, 'program_id' => $file->program_id],
        );

        return response()->json(['file' => $file->fresh()->load('uploader:id,name')]);
    }

    public function move(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        $this->abortIfInRetiredFolder($file);
        if ($file->locked) {
            abort(423, 'This file is locked and cannot be moved.');
        }

        $validated = $request->validate([
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        if (!empty($validated['folder_id'])) {
            $folder = \App\Models\Folder::find($validated['folder_id']);
            if (!$folder || $folder->program_id !== $file->program_id) {
                abort(422, 'The selected folder does not belong to this file\'s program.');
            }
            if ($folder->retired) {
                abort(422, 'This folder has been retired and can no longer receive files.');
            }
        }

        $oldFolderId = $file->folder_id;
        $file->update(['folder_id' => $validated['folder_id'] ?? null]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'file.moved',
            subjectType: 'File',
            subjectId: $file->id,
            subjectLabel: $file->original_name,
            metadata: ['old_folder_id' => $oldFolderId, 'new_folder_id' => $file->folder_id, 'program_id' => $file->program_id],
        );

        return response()->json(['file' => $file->fresh()->load('uploader:id,name')]);
    }

    public function toggleLock(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        $this->abortIfInRetiredFolder($file);

        $file->update(['locked' => !$file->locked]);

        ActivityLog::record(
            actor: $request->user(),
            action: $file->locked ? 'file.locked' : 'file.unlocked',
            subjectType: 'File',
            subjectId: $file->id,
            subjectLabel: $file->original_name,
            metadata: ['program_id' => $file->program_id, 'locked' => $file->locked],
        );

        return response()->json(['file' => $file->fresh()]);
    }

    public function destroy(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        $this->abortIfInRetiredFolder($file);
        if ($file->locked) {
            abort(423, 'This file is locked and cannot be deleted.');
        }

        // Soft delete only — the physical file stays on disk until the
        // Recycle Bin purges it (manually or after 30 days).
        $file->update(['deleted_by' => $request->user()->id]);
        $file->delete();

        ActivityLog::record(
            actor: $request->user(),
            action: 'file.deleted',
            subjectType: 'File',
            subjectId: $file->id,
            subjectLabel: $file->original_name,
            metadata: ['program_id' => $file->program_id, 'folder_id' => $file->folder_id],
        );

        return response()->json(['message' => 'File moved to Recycle Bin.']);
    }

    public function restore(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        if (is_null($file->deleted_at)) {
            abort(400, 'This file is not in the Recycle Bin.');
        }
        $this->abortIfInRetiredFolder($file);

        $file->restore();
        $file->update(['deleted_by' => null]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'file.restored',
            subjectType: 'File',
            subjectId: $file->id,
            subjectLabel: $file->original_name,
            metadata: ['program_id' => $file->program_id, 'folder_id' => $file->folder_id],
        );

        return response()->json(['file' => $file->fresh()->load('uploader:id,name')]);
    }

    public function purge(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        if (is_null($file->deleted_at)) {
            abort(400, 'This file is not in the Recycle Bin.');
        }
        $this->abortIfInRetiredFolder($file);

        $purged = $this->purgeService->purgeFile($file, $request->user());
        if (!$purged) {
            abort(423, 'This file is locked and cannot be permanently deleted. Unlock it first.');
        }

        return response()->json(['message' => 'File permanently deleted.']);
    }

    public function preview(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only preview files for your assigned program.');
        }
        $this->abortIfInRetiredFolder($file);

        $previewableMimes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!in_array($file->mime_type, $previewableMimes)) {
            abort(415, 'Preview is not available for this file type.');
        }

        if (!Storage::disk('local')->exists($file->stored_path)) {
            abort(404, 'File not found on disk.');
        }

        return Storage::disk('local')->response($file->stored_path, $file->original_name);
    }
}
