<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Indexes for the columns the hot read paths filter by. PostgreSQL does not
// auto-index foreign-key columns, and these tables were created without
// explicit indexes on program_id / folder_id / parent_id / retired /
// deleted_at / assigned_program — so every file-listing, folder-tree and
// recycle-bin query was a sequential scan. Harmless at a few hundred rows,
// slow once a program accumulates thousands of files.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('files', function (Blueprint $table) {
            // FileController@index: WHERE program_id = ? [AND folder_id = ?]
            $table->index(['program_id', 'folder_id'], 'files_program_folder_index');
            // Recycle bin / withTrashed scans.
            $table->index('deleted_at', 'files_deleted_at_index');
        });

        Schema::table('folders', function (Blueprint $table) {
            // FolderController@index: WHERE program_id = ? AND retired = false.
            $table->index(['program_id', 'retired'], 'folders_program_retired_index');
            // Descendant walks (collectDescendantIds) + uniqueness checks:
            // WHERE parent_id = ? / whereIn('parent_id', ...).
            $table->index('parent_id', 'folders_parent_id_index');
        });

        Schema::table('users', function (Blueprint $table) {
            // ProgramController@show + staff-by-program lookups.
            $table->index('assigned_program', 'users_assigned_program_index');
        });
    }

    public function down(): void
    {
        Schema::table('files', function (Blueprint $table) {
            $table->dropIndex('files_program_folder_index');
            $table->dropIndex('files_deleted_at_index');
        });

        Schema::table('folders', function (Blueprint $table) {
            $table->dropIndex('folders_program_retired_index');
            $table->dropIndex('folders_parent_id_index');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_assigned_program_index');
        });
    }
};
