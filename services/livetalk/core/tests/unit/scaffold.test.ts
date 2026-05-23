describe('@nagiyu/livetalk-core scaffold', () => {
  it('should be importable as an empty placeholder', async () => {
    const mod = await import('../../src/index.js');
    expect(mod).toBeDefined();
  });
});
