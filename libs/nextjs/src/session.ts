interface SessionWithOptionalUser {
  user?: unknown;
}

type SessionWithRequiredUser<TSession extends SessionWithOptionalUser> = TSession & {
  user: NonNullable<TSession['user']>;
};

export interface CreateSessionGetterOptions<
  TAuthSession extends SessionWithOptionalUser,
  TSessionResult = SessionWithRequiredUser<TAuthSession>,
> {
  auth: () => Promise<TAuthSession | null>;
  createTestSession: () => TSessionResult;
  mapSession?: (session: SessionWithRequiredUser<TAuthSession>) => TSessionResult;
}

export function createSessionGetter<
  TAuthSession extends SessionWithOptionalUser,
  TSessionResult = SessionWithRequiredUser<TAuthSession>,
>(options: CreateSessionGetterOptions<TAuthSession, TSessionResult>) {
  const { auth, createTestSession, mapSession } = options;

  return async (): Promise<TSessionResult | null> => {
    if (process.env.SKIP_AUTH_CHECK === 'true') {
      return createTestSession();
    }

    const session = await auth();
    if (!session?.user) {
      return null;
    }

    const sessionWithUser = session as SessionWithRequiredUser<TAuthSession>;
    return mapSession
      ? mapSession(sessionWithUser)
      : (sessionWithUser as unknown as TSessionResult);
  };
}
