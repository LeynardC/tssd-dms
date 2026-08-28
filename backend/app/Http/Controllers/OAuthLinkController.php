<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\OAuthAccountLink;
use Illuminate\Http\Request;

class OAuthLinkController extends Controller
{
    // The staff member's own linked/pending accounts — for their Settings page.
    public function index(Request $request)
    {
        $links = OAuthAccountLink::where('user_id', $request->user()->id)
            ->orderByDesc('requested_at')
            ->get();

        return response()->json(['links' => $links]);
    }

    // Cancels a pending request or revokes an approved link — either way,
    // only the owning staff member (or, per canManage-style rules
    // elsewhere in this app, the Chief) can act on their own account here.
    public function destroy(Request $request, OAuthAccountLink $link)
    {
        $user = $request->user();
        if ($link->user_id !== $user->id && !$user->hasRole('chief')) {
            abort(403, 'You can only manage your own linked accounts.');
        }

        $action = $link->status === 'approved' ? 'oauth_link.unlinked' : 'oauth_link.cancelled';
        $ownerId = $link->user_id;
        $ownerName = $link->user->name;
        $provider = $link->provider;

        $link->delete();

        ActivityLog::record(
            actor: $user,
            action: $action,
            subjectType: 'Staff',
            subjectId: $ownerId,
            subjectLabel: $ownerName,
            metadata: ['provider' => $provider],
        );

        return response()->json(['message' => 'Removed.']);
    }

    // Chief-only — every pending request across all staff, for the approval
    // list on the Users page.
    public function pending()
    {
        $links = OAuthAccountLink::where('status', 'pending')
            ->with('user:id,name,username,staff_id')
            ->orderBy('requested_at')
            ->get();

        return response()->json(['links' => $links]);
    }

    public function approve(Request $request, OAuthAccountLink $link)
    {
        if ($link->status !== 'pending') {
            abort(400, 'This request has already been reviewed.');
        }

        $link->update([
            'status' => 'approved',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'oauth_link.approved',
            subjectType: 'Staff',
            subjectId: $link->user_id,
            subjectLabel: $link->user->name,
            metadata: ['provider' => $link->provider, 'provider_email' => $link->provider_email],
        );

        return response()->json(['link' => $link->fresh()]);
    }

    public function reject(Request $request, OAuthAccountLink $link)
    {
        if ($link->status !== 'pending') {
            abort(400, 'This request has already been reviewed.');
        }

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $link->update([
            'status' => 'rejected',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'rejection_reason' => $validated['reason'] ?? null,
        ]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'oauth_link.rejected',
            subjectType: 'Staff',
            subjectId: $link->user_id,
            subjectLabel: $link->user->name,
            metadata: ['provider' => $link->provider, 'reason' => $validated['reason'] ?? null],
        );

        return response()->json(['link' => $link->fresh()]);
    }
}
