<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// The app's own collision checks (store(), rename(), restore()) only ever
// look at retired=false folders when deciding if a name is "taken" — a
// retired folder's name is meant to be free for reuse. The original unique
// index never encoded that: it blocked the duplicate at the database level
// regardless of retired status, so reusing a retired folder's name slipped
// past the app's friendly validation and died on a raw database error
// instead. This swaps it for a partial index that only unique-constrains
// name+location among active folders, matching what the app already assumed.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('folders', function (Blueprint $table) {
            $table->dropUnique('folders_program_id_parent_id_name_unique');
        });

        DB::statement(
            'CREATE UNIQUE INDEX folders_program_id_parent_id_name_active_unique ' .
            'ON folders (program_id, parent_id, name) WHERE retired = false'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS folders_program_id_parent_id_name_active_unique');

        Schema::table('folders', function (Blueprint $table) {
            $table->unique(['program_id', 'parent_id', 'name']);
        });
    }
};
