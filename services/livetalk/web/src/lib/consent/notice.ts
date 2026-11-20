import { privacyRevisions, termsRevisions, type LegalRevision } from '@/lib/legal/revisions';

/** 同意の対象になる文書。 */
export type ConsentDocumentKey = 'terms' | 'privacy';

/** 改定のお知らせに載せる、変わった文書 1 件分。 */
export interface RevisedDocument {
  key: ConsentDocumentKey;
  /** 表示名 */
  label: string;
  /** 全文のパス */
  href: string;
  /** 現行の版 */
  version: string;
  /** 現行の版の施行日 (履歴に無い版のときは null) */
  effectiveDate: string | null;
  /** 利用者がまだ読んでいない改定の要点 (古い順に並べた箇条書き) */
  summary: string[];
}

/**
 * 同意のダイアログに出す内容。
 * 初回は従来どおりの案内、改定は変わった文書の要点を示す。
 */
export type ConsentNotice =
  { kind: 'initial' } | { kind: 'revision'; documents: RevisedDocument[]; ageRequired: boolean };

/** GET /api/consent の応答のうち、お知らせの出し分けに使う部分。 */
export interface ConsentSnapshot {
  requiredVersions: { terms: string; privacy: string };
  current: {
    termsAgreed?: { version: string };
    privacyAgreed?: { version: string };
    ageVerified?: { value: boolean };
  } | null;
}

/**
 * 記録した版より後の改定を返す。
 * 記録した版が履歴に無いときは、何が変わったか辿れないため現行の版だけを返す。
 */
export function selectRevisionsSince(
  revisions: LegalRevision[],
  recordedVersion: string,
  requiredVersion: string
): LegalRevision[] {
  const recordedIndex = revisions.findIndex((revision) => revision.version === recordedVersion);
  if (recordedIndex >= 0) {
    return revisions.slice(recordedIndex + 1);
  }
  return revisions.filter((revision) => revision.version === requiredVersion);
}

function reviseDocument(
  key: ConsentDocumentKey,
  label: string,
  href: string,
  revisions: LegalRevision[],
  recordedVersion: string,
  requiredVersion: string
): RevisedDocument | null {
  if (recordedVersion === requiredVersion) return null;
  const unread = selectRevisionsSince(revisions, recordedVersion, requiredVersion);
  const latest = revisions.find((revision) => revision.version === requiredVersion);
  return {
    key,
    label,
    href,
    version: requiredVersion,
    effectiveDate: latest?.effectiveDate ?? null,
    summary: unread.flatMap((revision) => revision.summary),
  };
}

/**
 * 同意の状態から、ダイアログに出すお知らせを決める。
 *
 * 規約かポリシーの同意記録が (版を問わず) 残っていて、版が現行と違う文書があれば改定とする。
 * 記録が無い、または変わった文書が無い場合は初回として扱う。
 * 18 歳以上の申告は、記録済みなら改定のときに求めない。
 */
export function buildConsentNotice(snapshot: ConsentSnapshot | null): ConsentNotice {
  const current = snapshot?.current;
  if (!snapshot || !current) return { kind: 'initial' };

  const recordedTerms = current.termsAgreed?.version;
  const recordedPrivacy = current.privacyAgreed?.version;
  if (!recordedTerms && !recordedPrivacy) return { kind: 'initial' };

  const documents: RevisedDocument[] = [];
  // 片方の記録だけ欠けている場合も、その文書は現行の版を初めて読むことになるため載せる
  const terms = reviseDocument(
    'terms',
    '利用規約',
    '/legal/terms',
    termsRevisions,
    recordedTerms ?? '',
    snapshot.requiredVersions.terms
  );
  const privacy = reviseDocument(
    'privacy',
    'プライバシーポリシー',
    '/legal/privacy',
    privacyRevisions,
    recordedPrivacy ?? '',
    snapshot.requiredVersions.privacy
  );
  if (terms) documents.push(terms);
  if (privacy) documents.push(privacy);

  if (documents.length === 0) return { kind: 'initial' };

  return {
    kind: 'revision',
    documents,
    ageRequired: current.ageVerified?.value !== true,
  };
}
