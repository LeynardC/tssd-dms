<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Laravel\Fortify\Contracts\TwoFactorAuthenticationProvider;
use Laravel\Fortify\Fortify;

// A standalone "verify your already-enabled 2FA code" endpoint for an
// already-authenticated session — Fortify only ships this check bundled
// into the login-time challenge (TwoFactorLoginRequest, guest-only). This
// reuses the same TwoFactorAuthenticationProvider::verify() call and, on
// success, marks the session password-confirmed — the same flag Fortify's
// own password.confirm and passkey.confirm endpoints set — so this becomes
// an interchangeable third way to satisfy the `password.confirm` middleware.
class TwoFactorConfirmationController extends Controller
{
    public function store(Request $request, TwoFactorAuthenticationProvider $provider)
    {
        $validated = $request->validate(['code' => ['required', 'string']]);

        $user = $request->user();
        abort_unless(
            $user->two_factor_secret && $user->two_factor_confirmed_at,
            400,
            'Two-factor authentication is not enabled.',
        );

        $valid = $provider->verify(
            Fortify::currentEncrypter()->decrypt($user->two_factor_secret),
            $validated['code'],
        );
        abort_unless($valid, 422, 'Invalid authentication code.');

        $request->session()->passwordConfirmed();

        return response()->json(['message' => 'Verified.']);
    }
}
