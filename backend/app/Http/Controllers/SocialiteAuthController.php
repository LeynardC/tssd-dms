<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\OAuthAccountLink;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;

class SocialiteAuthController extends Controller
{
    // Belt-and-suspenders alongside the route's ->whereIn() constraint — no
    // arbitrary string should ever reach Socialite::driver().
    private const ALLOWED_PROVIDERS = ['google'];

    private function frontendUrl(): string
    {
        return rtrim(env('FRONTEND_URL', 'http://localhost:5173'), '/');
    }

    public function redirect(string $provider): RedirectResponse
    {
        abort_unless(in_array($provider, self::ALLOWED_PROVIDERS, true), 404);

        // Whether this round-trip is "link this Google account to my
        // already-logged-in staff account" or "log me in with an
        // already-approved Google account" depends entirely on whether the
        // browser is currently authenticated right now, before it ever
        // leaves for Google.
        session(['oauth_intent' => Auth::check() ? 'link' : 'login']);

        return Socialite::driver($provider)->redirect();
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        abort_unless(in_array($provider, self::ALLOWED_PROVIDERS, true), 404);

        $intent = $request->session()->pull('oauth_intent', 'login');

        try {
            $socialiteUser = Socialite::driver($provider)->user();
        } catch (\Throwable) {
            $target = $intent === 'link' ? '/settings' : '/login';
            return redirect($this->frontendUrl() . $target . '?oauth_error=' . urlencode(
                'Could not complete sign-in with Google. Please try again.',
            ));
        }

        return $intent === 'link'
            ? $this->handleLink($request, $provider, $socialiteUser)
            : $this->handleLogin($request, $provider, $socialiteUser);
    }

    // A staff member, already logged in, asking to attach a Google account
    // to their own account — this never creates a new user, only a pending
    // request against the one they're already signed into.
    private function handleLink(Request $request, string $provider, SocialiteUser $socialiteUser): RedirectResponse
    {
        if (!Auth::check()) {
            return redirect($this->frontendUrl() . '/login?oauth_error=' . urlencode(
                'Your session expired. Please log in and try linking again.',
            ));
        }

        $user = Auth::user();

        $existing = OAuthAccountLink::where('provider', $provider)
            ->where('provider_user_id', $socialiteUser->getId())
            ->whereIn('status', ['pending', 'approved'])
            ->first();

        if ($existing) {
            $message = $existing->user_id === $user->id
                ? "You've already requested to link this Google account."
                : 'This Google account is already linked to another staff account.';
            return redirect($this->frontendUrl() . '/settings?oauth_error=' . urlencode($message));
        }

        // One active (pending or approved) link per provider per user — the
        // Settings UI only ever displays one at a time, so allowing a second
        // to silently exist would make the first invisible/unmanageable.
        $alreadyHasOne = OAuthAccountLink::where('user_id', $user->id)
            ->where('provider', $provider)
            ->whereIn('status', ['pending', 'approved'])
            ->exists();

        if ($alreadyHasOne) {
            return redirect($this->frontendUrl() . '/settings?oauth_error=' . urlencode(
                'You already have a linked or pending Google account. Unlink it first before linking a different one.',
            ));
        }

        $link = OAuthAccountLink::create([
            'user_id' => $user->id,
            'provider' => $provider,
            'provider_user_id' => $socialiteUser->getId(),
            'provider_email' => $socialiteUser->getEmail(),
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        ActivityLog::record(
            actor: $user,
            action: 'oauth_link.requested',
            subjectType: 'Staff',
            subjectId: $user->id,
            subjectLabel: $user->name,
            metadata: ['provider' => $provider, 'provider_email' => $link->provider_email],
        );

        return redirect($this->frontendUrl() . '/settings?oauth_link=pending');
    }

    // Someone not currently logged in, trying to sign in with Google — the
    // only way this succeeds is an approved link already sitting in the
    // table. There is no path here that creates an account.
    private function handleLogin(Request $request, string $provider, SocialiteUser $socialiteUser): RedirectResponse
    {
        $link = OAuthAccountLink::where('provider', $provider)
            ->where('provider_user_id', $socialiteUser->getId())
            ->where('status', 'approved')
            ->first();

        if (!$link) {
            return redirect($this->frontendUrl() . '/login?oauth_error=' . urlencode(
                "This Google account isn't linked to a DOLE staff account yet, or is still awaiting Chief approval.",
            ));
        }

        $user = $link->user;

        if (!$user || !$user->is_active) {
            return redirect($this->frontendUrl() . '/login?oauth_error=' . urlencode(
                'This account has been deactivated. Contact your Chief for assistance.',
            ));
        }

        // Same session-based login Fortify itself establishes for
        // password sign-in — Sanctum's stateful-request handling picks it
        // up for subsequent API calls the same way either path works.
        // Google sign-in intentionally skips the TOTP challenge step here,
        // matching this app's existing passkey-login precedent.
        Auth::login($user);
        $request->session()->regenerate();

        return redirect($this->frontendUrl() . '/monitoring');
    }
}
