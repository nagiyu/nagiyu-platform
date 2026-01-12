export type Environment = 'dev' | 'prod';

export interface EnvConfig {
  environment: Environment;
  vpcCidr: string;
  maxAzs: number;
}

export function getEnvConfig(env: Environment): EnvConfig {
  return {
    environment: env,
    vpcCidr: env === 'prod' ? '10.1.0.0/24' : '10.0.0.0/24',
    maxAzs: env === 'prod' ? 2 : 1,
  };
}
