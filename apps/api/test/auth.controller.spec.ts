import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

describe('registration role flows', () => {
  it('assigns roles only through dedicated registration handlers', async () => {
    const auth = { register: jest.fn().mockResolvedValue({ accessToken: 'token' }) } as unknown as AuthService;
    const controller = new AuthController(auth);
    const dto = { name: 'Test User', email: 'test@example.com', password: 'a-strong-password' };

    await controller.register(dto);
    await controller.registerShopOwner(dto);
    await controller.registerRider(dto);
    await controller.registerAgent(dto);

    expect(auth.register).toHaveBeenNthCalledWith(1, dto);
    expect(auth.register).toHaveBeenNthCalledWith(2, dto, 'SHOP_OWNER');
    expect(auth.register).toHaveBeenNthCalledWith(3, dto, 'RIDER');
    expect(auth.register).toHaveBeenNthCalledWith(4, dto, 'AGENT');
  });
});
