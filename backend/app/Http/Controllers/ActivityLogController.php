<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\File;
use App\Models\Folder;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'subject_type' => ['required', 'string', 'in:File,Folder,Staff,Category'],
            'subject_id' => ['required', 'integer'],
        ]);

        $user = $request->user();
        $subjectType = $validated['subject_type'];
        $subjectId = $validated['subject_id'];

        if (!$user->hasRole('chief')) {
            if ($subjectType === 'Staff' || $subjectType === 'Category') {
                abort(403, 'You are not authorized to view this activity log.');
            }

            if ($subjectType === 'File') {
                $file = File::find($subjectId);
                if (!$file || $file->program_id !== $user->assigned_program) {
                    abort(403, 'You can only view activity for files in your assigned program.');
                }
            }

            if ($subjectType === 'Folder') {
                $folder = Folder::find($subjectId);
                if (!$folder || $folder->program_id !== $user->assigned_program) {
                    abort(403, 'You can only view activity for folders in your assigned program.');
                }
            }
        }

        $entries = ActivityLog::where('subject_type', $subjectType)
            ->where('subject_id', $subjectId)
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['entries' => $entries]);
    }
}
