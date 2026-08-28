<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Baseline response hardening for everything this backend serves — the API
 * JSON and the OAuth redirect routes. The Vue SPA is served separately and
 * needs the equivalent set applied at its own web server / host.
 *
 * Not set here on purpose:
 *  - Strict-Transport-Security: belongs at the TLS-terminating layer (the
 *    reverse proxy / load balancer), which knows the connection is HTTPS.
 *  - Content-Security-Policy: needs per-surface tuning; the API returns JSON
 *    and the SPA host is the right place to enforce a real CSP.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $headers = [
            // This backend is never meant to be embedded in a frame.
            'X-Frame-Options' => 'DENY',
            // Don't let the browser second-guess declared content types.
            'X-Content-Type-Options' => 'nosniff',
            // Send only the origin on cross-site navigations, nothing on downgrade.
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'X-Permitted-Cross-Domain-Policies' => 'none',
            // Turn off browser features the app doesn't use.
            'Permissions-Policy' => 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
        ];

        foreach ($headers as $name => $value) {
            if (!$response->headers->has($name)) {
                $response->headers->set($name, $value);
            }
        }

        return $response;
    }
}
