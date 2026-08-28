<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Folder retirement previously didn't cascade to descendants, so a
     * subfolder of an already-retired folder could stay `retired = false`
     * and keep surfacing its files in the File Explorer, Monitoring, and
     * Search. Backfill: any folder with a retired ancestor is retired too.
     */
    public function up(): void
    {
        do {
            $changed = DB::table('folders')
                ->whereIn('parent_id', function ($query) {
                    $query->select('id')->from('folders')->where('retired', true);
                })
                ->where('retired', false)
                ->update(['retired' => true]);
        } while ($changed > 0);
    }

    public function down(): void
    {
        // Not reversible — we can't distinguish folders that were already
        // retired before this backfill from ones cascaded by it.
    }
};
