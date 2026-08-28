<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\ResetsUserPasswords;

class ResetUserPassword implements ResetsUserPasswords
{
    use PasswordValidationRules;

    /**
     * Validate and reset the user's forgotten password.
     *
     * @param  array<string, string>  $input
     *
     * @throws ValidationException
     */
    public function reset(User $user, array $input): void
    {
        Validator::make($input, [
            'password' => $this->passwordRules(),
        ])->validate();

        // Completing the reset flow proves control of the account and sets a
        // policy-compliant password — clear the forced-change flag so the
        // user isn't immediately asked to change it again on next login.
        $user->forceFill([
            'password' => Hash::make($input['password']),
            'must_change_password' => false,
        ])->save();
    }
}
