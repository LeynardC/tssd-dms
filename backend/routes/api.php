<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\FolderController;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Actions\Fortify\UpdateUserPassword;
use App\Http\Controllers\FileController;
use App\Http\Controllers\CategoryController;

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
        ]);
    });

    Route::put('/password/change', function (Request $request, UpdateUserPassword $updater) {
        $user = $request->user();

        if ($user->must_change_password) {
            $updater->forceUpdateWithoutCurrentPassword($user, $request->all());
        } else {
            $updater->update($user, $request->all());
        }

        return response()->json(['message' => 'Password updated.']);
    });

    Route::put('/profile/complete', function (Request $request) {
        $validated = $request->validate([
            'position' => ['required', 'string', 'max:255'],
            'unit' => ['required', 'string', Rule::in(['unit_001', 'unit_002', 'unit_003'])],
            'assigned_program' => ['required', 'string', 'max:255'],
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

    Route::get('/categories', [CategoryController::class, 'index']);

    Route::get('/files', [FileController::class, 'index']);
    Route::post('/files', [FileController::class, 'store']);
    Route::get('/files/{file}', [FileController::class, 'show']);
    Route::get('/files/{file}/download', [FileController::class, 'download']);
    Route::get('/files/{file}/preview', [FileController::class, 'preview']);
    Route::patch('/files/{file}/rename', [FileController::class, 'rename']);
    Route::patch('/files/{file}/move', [FileController::class, 'move']);
    Route::patch('/files/{file}/toggle-lock', [FileController::class, 'toggleLock']);
    Route::delete('/files/{file}', [FileController::class, 'destroy']);
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

        Route::post('/categories', [CategoryController::class, 'store']);
        Route::patch('/categories/{category}/rename', [CategoryController::class, 'rename']);
        Route::patch('/categories/{category}/toggle-status', [CategoryController::class, 'toggleStatus']);
    });

    #endregion

});
