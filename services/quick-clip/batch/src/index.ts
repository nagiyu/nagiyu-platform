export const createBatchBootstrapMessage = (): string => {
  return 'quick-clip-batch bootstrap: ok';
};

if (process.env.NODE_ENV !== 'test') {
  console.log(createBatchBootstrapMessage());
}
