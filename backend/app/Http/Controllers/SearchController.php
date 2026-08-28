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
            'q' => ['required', 'string', 'min:2', 'max:255'],
        ]);

        $query = trim($validated['q']);
        $user = $request->user();
        $isChief = $user->hasRole('chief');

        // LOWER(...) LIKE ? works the same on SQLite, MySQL, and PostgreSQL —
        // ILIKE is PostgreSQL-only and errors out on the other two, which
        // includes this project's own default local database (SQLite).
        //
        // addcslashes() escapes the LIKE metacharacters % and _ (and the
        // escape char itself) so a search for "50%" or "a_b" matches those
        // literals instead of turning the whole query into a wildcard. The
        // explicit ESCAPE '\' clause is required because SQLite's LIKE has
        // no default escape character; MySQL and PostgreSQL accept it too.
        $needle = '%' . addcslashes(strtolower($query), '%_\\') . '%';
        $like = "LIKE ? ESCAPE '\\'";

        $fileQuery = File::query()
            ->whereRaw("LOWER(original_name) $like", [$needle])
            ->whereDoesntHave('folder', fn ($q) => $q->where('retired', true))
            ->with('uploader:id,name');

        $folderQuery = Folder::query()
            ->whereRaw("LOWER(name) $like", [$needle])
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
                ->where(function ($q) use ($needle, $like) {
                    $q->whereRaw("LOWER(name) $like", [$needle])
                        ->orWhereRaw("LOWER(username) $like", [$needle])
                        ->orWhereRaw("LOWER(staff_id) $like", [$needle]);
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
