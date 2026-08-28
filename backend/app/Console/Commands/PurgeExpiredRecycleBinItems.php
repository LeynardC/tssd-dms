<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\RecycleBinPurgeService;
use Illuminate\Console\Command;

class PurgeExpiredRecycleBinItems extends Command
{
    protected $signature = 'recycle-bin:purge-expired';

    protected $description = 'Permanently deletes folders/files that have been in the Recycle Bin for 30+ days, skipping any that still contain a locked file.';

    public function handle(RecycleBinPurgeService $service): int
    {
        $system = User::where('username', 'system')->first();
        if (!$system) {
            $this->error('System user not found — run `php artisan db:seed --class=SystemUserSeeder` first.');
            return self::FAILURE;
        }

        $folderResult = $service->purgeFolders($service->expiredFolderRoots(), $system);
        $purgedFolders = $folderResult['purged'];
        $skippedFolders = $folderResult['skipped'];

        $purgedFiles = $skippedFiles = 0;
        foreach ($service->expiredFiles() as $file) {
            $service->purgeFile($file, $system) ? $purgedFiles++ : $skippedFiles++;
        }

        $this->info(sprintf(
            'Purged %d folder(s), %d file(s). Skipped %d folder(s) / %d file(s) — locked content inside.',
            $purgedFolders,
            $purgedFiles,
            $skippedFolders,
            $skippedFiles,
        ));

        return self::SUCCESS;
    }
}
