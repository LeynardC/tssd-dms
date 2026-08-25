<?php

namespace App\Http\Controllers;

use App\Models\File;
use App\Models\Folder;
use App\Models\User;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:1', 'max:255'],
        ]);

        $query = trim($validated['q']);
        $user = $request->user();
        $isChief = $user->hasRole('chief');

        $fileQuery = File::query()
            ->where('original_name', 'ILIKE', "%{$query}%")
            ->with('uploader:id,name');

        $folderQuery = Folder::query()
            ->where('name', 'ILIKE', "%{$query}%")
            ->where('retired', false);

        if (!$isChief) {
            $fileQuery->where('program_id', $user->assigned_program);
            $folderQuery->where('program_id', $user->assigned_program);
        }

        // Staff search: Chief-only. Non-chief requesters always get an
        // empty array here, regardless of what they search for — matching
        // the existing Chief-gated access pattern used for Categories and
        // the /users routes themselves.
        $staffResults = [];
        if ($isChief) {
            $staffResults = User::role('staff')
                ->where(function ($q) use ($query) {
                    $q->where('name', 'ILIKE', "%{$query}%")
                        ->orWhere('username', 'ILIKE', "%{$query}%")
                        ->orWhere('staff_id', 'ILIKE', "%{$query}%");
                })
                ->select(['id', 'name', 'username', 'staff_id', 'unit', 'assigned_program'])
                ->limit(25)
                ->get();
        }

        return response()->json([
            'files' => $fileQuery->limit(25)->get(),
            'folders' => $folderQuery->limit(25)->get(),
            'staff' => $staffResults,
        ]);
    }
}
