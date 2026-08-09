<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255', Rule::unique(User::class)],
            'staff_id' => ['required', 'string', 'max:255', Rule::unique(User::class)],
        ]);

        $tempPassword = Str::password(10);

        $user = User::create([
            'name' => $validated['name'],
            'username' => strtolower($validated['username']),
            'staff_id' => $validated['staff_id'],
            'password' => $tempPassword,
            'must_change_password' => true,
            'profile_completed' => false,
        ]);

        $user->assignRole('staff');

        return response()->json([
            'user' => $user,
            'temp_password' => $tempPassword,
        ], 201);
    }

    public function index()
    {
        $staff = User::role('staff')
            ->select([
                'id',
                'name',
                'username',
                'staff_id',
                'position',
                'unit',
                'assigned_program',
                'must_change_password',
                'profile_completed',
                'is_active',
                'created_at',
            ])
            ->orderBy('name')
            ->get();

        return response()->json(['staff' => $staff]);
    }

    public function toggleActive(User $user)
    {
        if ($user->hasRole('chief')) {
            abort(403, 'Cannot modify a chief account through this endpoint.');
        }

        $user->update(['is_active' => !$user->is_active]);

        return response()->json(['user' => $user->fresh()]);
    }

    public function resetPassword(User $user)
    {
        if ($user->hasRole('chief')) {
            abort(403, 'Cannot reset a chief account through this endpoint.');
        }

        $tempPassword = Str::password(10);
        $user->forceFill([
            'password' => $tempPassword,
            'must_change_password' => true,
        ])->save();

        return response()->json([
            'user' => $user->fresh(),
            'temp_password' => $tempPassword,
        ]);
    }

    public function update(Request $request, User $user)
    {
        if ($user->hasRole('chief')) {
            abort(403, 'Cannot modify a chief account through this endpoint.');
        }

        $validated = $request->validate([
            'position' => ['required', 'string', 'max:255'],
            'unit' => ['required', 'string', Rule::in(['unit_001', 'unit_002', 'unit_003'])],
            'assigned_program' => ['required', 'string', 'max:255'],
        ]);

        $user->update($validated);

        return response()->json(['user' => $user->fresh()]);
    }

    public function destroy(User $user)
    {
        if ($user->hasRole('chief')) {
            abort(403, 'Cannot delete a chief account through this endpoint.');
        }

        $user->delete();

        return response()->json(['message' => 'Staff account deleted.']);
    }
}
