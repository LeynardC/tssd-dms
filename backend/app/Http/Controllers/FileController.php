<?php

namespace App\Http\Controllers;

use App\Models\File;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FileController extends Controller
{
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

        return response()->json(['file' => $file->load('uploader:id,name')]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'program_id' => ['required', 'string'],
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
            'file' => ['required', 'file', 'max:' . (self::MAX_SIZE_BYTES / 1024)],
            'description' => ['nullable', 'string', 'max:25000'],
            'parsed_data' => ['nullable', 'string'],
        ]);

        if (!$this->canManageProgram($request, $validated['program_id'])) {
            abort(403, 'You can only upload files for your assigned program.');
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
        return response()->json(['file' => $file->load('uploader:id,name')], 201);
    }

    public function download(Request $request, File $file): StreamedResponse
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only download files for your assigned program.');
        }

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
        if ($file->locked) {
            abort(423, 'This file is locked and cannot be renamed.');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $file->update(['original_name' => trim($validated['name'])]);

        return response()->json(['file' => $file->fresh()->load('uploader:id,name')]);
    }

    public function move(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        if ($file->locked) {
            abort(423, 'This file is locked and cannot be moved.');
        }

        $validated = $request->validate([
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        $file->update(['folder_id' => $validated['folder_id'] ?? null]);

        return response()->json(['file' => $file->fresh()->load('uploader:id,name')]);
    }

    public function toggleLock(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }

        $file->update(['locked' => !$file->locked]);

        return response()->json(['file' => $file->fresh()]);
    }

    public function destroy(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only manage files for your assigned program.');
        }
        if ($file->locked) {
            abort(423, 'This file is locked and cannot be deleted.');
        }

        Storage::disk('local')->delete($file->stored_path);
        $file->delete();

        return response()->json(['message' => 'File deleted.']);
    }

    public function preview(Request $request, File $file)
    {
        if (!$this->canManageProgram($request, $file->program_id)) {
            abort(403, 'You can only preview files for your assigned program.');
        }

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
