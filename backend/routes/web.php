<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\SocialiteAuthController;

Route::get('/', function () {
    return view('welcome');
});

// Real browser redirects, not JSON — Google needs to land the user back
// here directly, so these live outside routes/api.php. Session-based, same
// cookie the SPA already uses (Sanctum's stateful-request handling), so
// Auth::check()/Auth::login() here behave exactly like the rest of the app.
Route::get('/auth/{provider}/redirect', [SocialiteAuthController::class, 'redirect'])
    ->whereIn('provider', ['google']);
Route::get('/auth/{provider}/callback', [SocialiteAuthController::class, 'callback'])
    ->whereIn('provider', ['google']);
