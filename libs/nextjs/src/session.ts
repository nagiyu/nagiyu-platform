interface SessionWithOptionalUser {
  user?: unknown;
}

type SessionWithRequiredUser<TSession extends SessionWithOptionalUser> = TSession & {
  user: NonNullable<TSession['user']>;
};

export interface CreateSessionGetterOptions<
  TAuthSession extends SessionWithOptionalUser,
  TSessionResult,
> {
  auth: () => Promise<TAuthSession | null>;
  createTestSession: () => TSessionResult;
  mapSession: (session: SessionWithRequiredUser<TAuthSession>) => TSessionResult;
}

export function createSessionGetter<TAuthSession extends SessionWithOptionalUser, TSessionResult>(
  options: CreateSessionGetterOptions<TAuthSession, TSessionResult>
) {
  const { auth, createTestSession, mapSession } = options;

  return async (): Promise<TSessionResult | null> => {
    if (process.env.SKIP_AUTH_CHECK === 'true') {
      return createTestSession();
    }

    const session = await auth();
    if (!session?.user) {
      return null;
    }

    return mapSession(session as SessionWithRequiredUser<TAuthSession>);
  };
}
