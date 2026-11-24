import { AttestationCatalogService } from '../src/attestation/attestation-catalog.service';

describe('AttestationCatalogService', () => {
  it('returns only configured services and calculates pickup plus return delivery', () => {
    const catalogue = new AttestationCatalogService();
    const services = catalogue.list();
    const quote = catalogue.quote(services[0].id, 5, 5, false);

    expect(services.length).toBeGreaterThan(0);
    expect(services[0].requiresOriginals).toBe(true);
    expect(quote.serviceFee).toBe(services[0].serviceFee);
    expect(quote.pickupDelivery).toBe(15);
    expect(quote.returnDelivery).toBe(15);
    expect(quote.total).toBe(quote.serviceFee + quote.pickupDelivery + quote.returnDelivery + quote.tax);
  });
});
