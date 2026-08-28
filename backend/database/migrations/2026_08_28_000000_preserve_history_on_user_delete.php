<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Two related problems, both about what happens when a staff account is deleted:
//
//  1. activity_log.actor_id was created with cascadeOnDelete() — deleting a
//     staff member wiped their entire recorded history (uploads, deletions,
//     folder changes). actor_name is denormalized precisely so the trail can
//     outlive the account; the cascade defeated that. Switch to nullOnDelete()
//     so the rows (and the name) survive.
//
//  2. files.uploaded_by and folders.created_by were plain ->constrained('users')
//     — i.e. ON DELETE RESTRICT. Deleting anyone who has ever uploaded a file or
//     created a folder (nearly everyone) threw an uncaught QueryException, shown
//     to the Chief as a generic "Could not delete account." Both become
//     nullable + nullOnDelete(), matching programs.created_by / units.created_by
//     and the earlier add_null_on_delete_to_actor_foreign_keys migration.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_log', function (Blueprint $table) {
            $table->dropForeign(['actor_id']);
        });
        Schema::table('activity_log', function (Blueprint $table) {
            $table->unsignedBigInteger('actor_id')->nullable()->change();
        });
        Schema::table('activity_log', function (Blueprint $table) {
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('files', function (Blueprint $table) {
            $table->dropForeign(['uploaded_by']);
        });
        Schema::table('files', function (Blueprint $table) {
            $table->unsignedBigInteger('uploaded_by')->nullable()->change();
        });
        Schema::table('files', function (Blueprint $table) {
            $table->foreign('uploaded_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('folders', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
        });
        Schema::table('folders', function (Blueprint $table) {
            $table->unsignedBigInteger('created_by')->nullable()->change();
        });
        Schema::table('folders', function (Blueprint $table) {
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('activity_log', function (Blueprint $table) {
            $table->dropForeign(['actor_id']);
        });
        Schema::table('activity_log', function (Blueprint $table) {
            $table->unsignedBigInteger('actor_id')->nullable(false)->change();
        });
        Schema::table('activity_log', function (Blueprint $table) {
            $table->foreign('actor_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::table('files', function (Blueprint $table) {
            $table->dropForeign(['uploaded_by']);
        });
        Schema::table('files', function (Blueprint $table) {
            $table->unsignedBigInteger('uploaded_by')->nullable(false)->change();
        });
        Schema::table('files', function (Blueprint $table) {
            $table->foreign('uploaded_by')->references('id')->on('users');
        });

        Schema::table('folders', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
        });
        Schema::table('folders', function (Blueprint $table) {
            $table->unsignedBigInteger('created_by')->nullable(false)->change();
        });
        Schema::table('folders', function (Blueprint $table) {
            $table->foreign('created_by')->references('id')->on('users');
        });
    }
};
