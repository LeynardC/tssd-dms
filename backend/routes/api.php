<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\FolderController;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Actions\Fortify\UpdateUserPassword;
use App\Http\Controllers\FileController;
use App\Http\Controllers\ProgramController;
use App\Http\Controllers\UnitController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\RecycleBinController;
use App\Http\Controllers\OAuthLinkController;

Route::middleware(['auth:sanctum'])->group(function () {

    #region Both Chief and Staff
    // Every route here is reachable by any authenticated user, regardless of
    // role. Where a route needs to behave differently per role (e.g. Folders
    // scoping staff to their own assigned_program), that logic lives inside
    // the controller itself, not the route definition.

    Route::get('/user', function (Request $request) {
        $user = $request->user();

        return response()->json([
            ...$user->toArray(),
            'role' => $user->getRoleNames()->first(),
            'two_factor_enabled' => $user->two_factor_confirmed_at !== null,
        ]);
    });

    Route::put('/password/change', function (Request $request, UpdateUserPassword $updater) {
        $user = $request->user();

        if ($user->must_change_password) {
            $updater->forceUpdateWithoutCurrentPassword($user, $request->all());
        } else {
            $updater->update($user, $request->all());
        }

        // Changing the password rotates the hash that AuthenticateSession
        // (active for the stateful SPA) checks on every request — without
        // this, THIS session would be invalidated on its very next call and
        // the user bounced to /login mid-onboarding. logoutOtherDevices()
        // re-syncs the current session's stored hash and revokes every other
        // one, so the caller stays signed in and no client-side
        // logout/re-login dance is needed.
        Auth::guard('web')->logoutOtherDevices($request->input('password'));

        return response()->json(['message' => 'Password updated.']);
    })->middleware('throttle:10,1');

    Route::put('/profile/complete', function (Request $request) {
        $validated = $request->validate([
            'position' => ['required', 'string', 'max:255'],
            'unit' => ['required', 'string', Rule::exists('units', 'code')->where(fn ($q) => $q->where('retired', false))],
            'assigned_program' => ['required', 'string', Rule::exists('programs', 'code')->where(fn ($q) => $q->where('retired', false))],
        ]);

        $request->user()->forceFill([
            ...$validated,
            'profile_completed' => true,
        ])->save();

        return response()->json(['user' => $request->user()->fresh()]);
    })->name('profile.complete');

    // Folders — Chief can manage all programs; Staff limited to their own
    // assigned_program. Enforced inside FolderController@canManage(), not here.
    Route::get('/folders', [FolderController::class, 'index']);
    Route::post('/folders', [FolderController::class, 'store']);
    Route::patch('/folders/{folder}/rename', [FolderController::class, 'rename']);
    Route::patch('/folders/{folder}/retire', [FolderController::class, 'retire']);
    Route::patch('/folders/{folder}/restore', [FolderController::class, 'restore']);
    Route::delete('/folders/{folder}/purge', [FolderController::class, 'purge']);

    Route::get('/programs', [ProgramController::class, 'index']);
    Route::get('/programs/{program:code}', [ProgramController::class, 'show']);

    Route::get('/units', [UnitController::class, 'index']);

    Route::get('/files', [FileController::class, 'index']);
    // Tighter than the /api group's 120/min — an upload writes a 25MB file to
    // disk, so it's the one endpoint worth its own ceiling. 30/min still
    // clears any realistic bulk-upload session.
    Route::post('/files', [FileController::class, 'store'])->middleware('throttle:30,1');
    Route::get('/user/passkeys', function (Request $request) {
        return response()->json([
            'passkeys' => $request->user()->passkeys()
                ->select(['id', 'name', 'last_used_at', 'created_at'])
                ->orderByDesc('created_at')
                ->get(),
        ]);
    });

    Route::get('/files/{file}', [FileController::class, 'show']);
    Route::get('/files/{file}/download', [FileController::class, 'download']);
    Route::get('/files/{file}/preview', [FileController::class, 'preview']);
    Route::patch('/files/{file}/rename', [FileController::class, 'rename']);
    Route::patch('/files/{file}/move', [FileController::class, 'move']);
    Route::post('/files/{file}/replace', [FileController::class, 'replace'])->middleware('throttle:30,1');
    Route::patch('/files/{file}/toggle-lock', [FileController::class, 'toggleLock']);
    Route::delete('/files/{file}', [FileController::class, 'destroy']);
    Route::patch('/files/{file}/restore', [FileController::class, 'restore'])->withTrashed();
    Route::delete('/files/{file}/purge', [FileController::class, 'purge'])->withTrashed();

    Route::get('/recycle-bin', [RecycleBinController::class, 'index']);
    Route::post('/recycle-bin/empty', [RecycleBinController::class, 'emptyBin']);

    Route::get('/activity-log', [ActivityLogController::class, 'index']);

    Route::get('/search', [SearchController::class, 'index']);

    // A staff member's own linked/pending sign-in accounts (Settings page).
    Route::get('/oauth-links', [OAuthLinkController::class, 'index']);
    Route::delete('/oauth-links/{link}', [OAuthLinkController::class, 'destroy']);

    #endregion


    #region Chief Role 
    // Chief-only. Handles creating, listing, editing, deactivating,
    // resetting passwords for, and deleting staff accounts.

    Route::middleware(['role:chief'])->group(function () {
        Route::post('/staff', [StaffController::class, 'store']);
        Route::get('/staff', [StaffController::class, 'index']);
        Route::patch('/staff/{user}/toggle-active', [StaffController::class, 'toggleActive']);
        Route::post('/staff/{user}/reset-password', [StaffController::class, 'resetPassword']);
        Route::patch('/staff/{user}', [StaffController::class, 'update']);
        Route::delete('/staff/{user}', [StaffController::class, 'destroy']);

        Route::post('/programs', [ProgramController::class, 'store']);
        Route::patch('/programs/{program}/rename', [ProgramController::class, 'rename']);
        Route::patch('/programs/{program}/toggle-status', [ProgramController::class, 'toggleStatus']);
        Route::patch('/programs/{program:code}/profile', [ProgramController::class, 'updateProfile']);

        Route::post('/units', [UnitController::class, 'store']);
        Route::patch('/units/{unit}/rename', [UnitController::class, 'rename']);
        Route::patch('/units/{unit}/description', [UnitController::class, 'updateDescription']);
        Route::patch('/units/{unit}/toggle-status', [UnitController::class, 'toggleStatus']);

        Route::get('/oauth-links/pending', [OAuthLinkController::class, 'pending']);
        Route::post('/oauth-links/{link}/approve', [OAuthLinkController::class, 'approve']);
        Route::post('/oauth-links/{link}/reject', [OAuthLinkController::class, 'reject']);
    });

    #endregion

});
