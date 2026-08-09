<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('files', function (Blueprint $table) {
            $table->id();
            $table->string('program_id');
            $table->foreignId('folder_id')->nullable()->constrained('folders')->nullOnDelete();
            $table->string('original_name'); // as uploaded, e.g. "SPES_Q1_2026.xlsx"
            $table->string('stored_path'); // actual path on disk, never exposed to frontend directly
            $table->string('mime_type');
            $table->unsignedBigInteger('size_bytes');
            $table->foreignId('uploaded_by')->constrained('users');
            $table->text('description')->nullable();
            $table->boolean('locked')->default(false); // "Lock/deactivate" from your spec
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('files');
    }
};
