<?php

namespace Database\Seeders;

use App\Models\Program;
use Illuminate\Database\Seeder;

class ProgramSeeder extends Seeder
{
    public function run(): void
    {
        $programs = [
            ['code' => 'aep', 'name' => 'AEP', 'unit' => 'unit_001'],
            ['code' => 'amp', 'name' => 'AMP', 'unit' => 'unit_001'],
            ['code' => 'do174', 'name' => 'DO 174', 'unit' => 'unit_001'],
            ['code' => 'gip', 'name' => 'GIP', 'unit' => 'unit_001'],
            ['code' => 'peso', 'name' => 'PESO', 'unit' => 'unit_001'],
            ['code' => 'spes', 'name' => 'SPES', 'unit' => 'unit_001'],
            ['code' => 'labor_inspection', 'name' => 'Labor Inspection', 'unit' => 'unit_002'],
            ['code' => 'labor_relations', 'name' => 'Labor Relations', 'unit' => 'unit_002'],
            ['code' => 'livelihood', 'name' => 'Livelihood', 'unit' => 'unit_003'],
            ['code' => 'tupad', 'name' => 'TUPAD', 'unit' => 'unit_003'],
        ];

        foreach ($programs as $program) {
            Program::firstOrCreate(
                ['code' => $program['code']],
                $program,
            );
        }
    }
}
