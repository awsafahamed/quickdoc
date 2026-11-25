import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from '../src/auth/auth.dto';

describe('registration role validation', () => {
  const credentials = {
    email: 'agent@example.com',
    name: 'Agency owner',
    password: 'secure-password',
  };

  it('accepts the shared registration credentials without a role field', async () => {
    const dto = plainToInstance(RegisterDto, credentials);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('does not expose role assignment on public registration credentials', async () => {
    const dto = plainToInstance(RegisterDto, { ...credentials, role: 'ADMIN' });
    await validate(dto, { whitelist: true });
    expect('role' in dto).toBe(false);
  });
});
