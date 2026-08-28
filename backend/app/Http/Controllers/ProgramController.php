<?php

namespace App\Http\Controllers;

use App\Models\Program;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProgramController extends Controller
{
    public function index()
    {
        $programs = Program::where('retired', false)
            ->orderBy('unit')
            ->orderBy('name')
            ->get();

        return response()->json(['programs' => $programs]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:255', 'alpha_dash', Rule::unique(Program::class)],
            'name' => ['required', 'string', 'max:255'],
            'unit' => ['required', 'string', Rule::exists('units', 'code')->where(fn ($q) => $q->where('retired', false))],
        ]);

        $exists = Program::where('unit', $validated['unit'])
            ->whereRaw('LOWER(name) = ?', [strtolower($validated['name'])])
            ->where('retired', false)
            ->exists();

        if ($exists) {
            abort(422, 'A program with that name already exists in this unit.');
        }

        $program = Program::create([
            'code' => strtolower($validated['code']),
            'name' => trim($validated['name']),
            'unit' => $validated['unit'],
            'created_by' => $request->user()->id,
            'retired' => false,
        ]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'program.created',
            subjectType: 'Program',
            subjectId: $program->id,
            subjectLabel: $program->name,
            metadata: ['code' => $program->code, 'unit' => $program->unit],
        );

        return response()->json(['program' => $program], 201);
    }

    public function rename(Request $request, Program $program)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $exists = Program::where('unit', $program->unit)
            ->where('id', '!=', $program->id)
            ->whereRaw('LOWER(name) = ?', [strtolower($validated['name'])])
            ->where('retired', false)
            ->exists();

        if ($exists) {
            abort(422, 'A program with that name already exists in this unit.');
        }

        $oldName = $program->name;
        $program->update(['name' => trim($validated['name'])]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'program.renamed',
            subjectType: 'Program',
            subjectId: $program->id,
            subjectLabel: $program->name,
            metadata: ['old_name' => $oldName, 'new_name' => $program->name, 'unit' => $program->unit],
        );

        return response()->json(['program' => $program->fresh()]);
    }

    public function toggleStatus(Request $request, Program $program)
    {
        $program->update(['retired' => !$program->retired]);

        ActivityLog::record(
            actor: $request->user(),
            action: $program->retired ? 'program.retired' : 'program.restored',
            subjectType: 'Program',
            subjectId: $program->id,
            subjectLabel: $program->name,
            metadata: ['unit' => $program->unit],
        );

        return response()->json(['program' => $program->fresh()]);
    }

    // Program Profile page: the program's own record plus its currently
    // assigned, active staff — reuses the existing assigned_program column,
    // no new relation needed.
    public function show(Program $program)
    {
        $staff = User::where('assigned_program', $program->code)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'position']);

        return response()->json(['program' => $program, 'staff' => $staff]);
    }

    public function updateProfile(Request $request, Program $program)
    {
        $validated = $request->validate([
            'founded_at' => ['nullable', 'date'],
            'vision' => ['nullable', 'string'],
            'mission' => ['nullable', 'string'],
            'scope' => ['nullable', 'string'],
        ]);

        $program->update($validated);

        ActivityLog::record(
            actor: $request->user(),
            action: 'program.profile_updated',
            subjectType: 'Program',
            subjectId: $program->id,
            subjectLabel: $program->name,
            metadata: [],
        );

        return response()->json(['program' => $program->fresh()]);
    }
}
