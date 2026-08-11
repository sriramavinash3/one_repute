import { encryptToken, decryptToken } from '../src/common/utils/token-encryption.util';

describe('token-encryption.util', () => {
  const sampleToken = '1//04_abcdef1234567890_Google_Refresh_Token';

  it('should correctly encrypt and decrypt a refresh token', () => {
    const encrypted = encryptToken(sampleToken);
    expect(encrypted).not.toEqual(sampleToken);
    expect(encrypted.split(':').length).toBe(3);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toEqual(sampleToken);
  });

  it('should return unencrypted legacy tokens as-is without throwing', () => {
    const plainToken = '1//legacy_unencrypted_refresh_token';
    const result = decryptToken(plainToken);
    expect(result).toEqual(plainToken);
  });

  it('should return empty/null input as-is', () => {
    expect(decryptToken('')).toEqual('');
    expect(encryptToken('')).toEqual('');
  });
});
