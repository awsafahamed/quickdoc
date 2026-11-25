import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from '../src/auth/auth.dto';

describe('registration role validation', () => {
  const credentials = {
    email: 'agent@example.com',
    name: 'Agency owner',
    password: 'secure-password',
  };

  it('accepts agent registration', async () => {
    const dto = plainToInstance(RegisterDto, { ...credentials, role: 'AGENT' });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects self-assigned administrator access', async () => {
    const dto = plainToInstance(RegisterDto, { ...credentials, role: 'ADMIN' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });
});
