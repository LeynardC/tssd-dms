<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // folders.retired_by, files.deleted_by, and oauth_account_links.reviewed_by
    // were added as plain ->constrained('users') — no explicit ON DELETE
    // behavior, so the database defaults to RESTRICT. That's inconsistent
    // with every other "acted by a user" FK in this schema (categories.created_by,
    // folders.parent_id both use nullOnDelete()), and means deleting a staff
    // account who retired a folder, soft-deleted a file, or reviewed an OAuth
    // link throws an uncaught QueryException instead of just clearing the
    // reference.
    public function up(): void
    {
        Schema::table('folders', function (Blueprint $table) {
            $table->dropForeign(['retired_by']);
            $table->foreign('retired_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('files', function (Blueprint $table) {
            $table->dropForeign(['deleted_by']);
            $table->foreign('deleted_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('oauth_account_links', function (Blueprint $table) {
            $table->dropForeign(['reviewed_by']);
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('folders', function (Blueprint $table) {
            $table->dropForeign(['retired_by']);
            $table->foreign('retired_by')->references('id')->on('users');
        });

        Schema::table('files', function (Blueprint $table) {
            $table->dropForeign(['deleted_by']);
            $table->foreign('deleted_by')->references('id')->on('users');
        });

        Schema::table('oauth_account_links', function (Blueprint $table) {
            $table->dropForeign(['reviewed_by']);
            $table->foreign('reviewed_by')->references('id')->on('users');
        });
    }
};
