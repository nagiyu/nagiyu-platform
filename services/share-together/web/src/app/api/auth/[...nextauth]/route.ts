import { handlers } from '../../../../../auth';

// サインアウト処理は Cookie 発行元の auth サービスに集約する方針のため、
// consumer である share-together はローカルで signout POST を受け付けない。
// POST を export しないことで /api/auth/signout への直接 POST を無効化し、
// 内部ホスト名（ip-10-x-x-x.ec2.internal）へのリダイレクトによる
// ERR_NAME_NOT_RESOLVED を防ぐ。
// GET は /api/auth/session の取得に使用するため維持する。
export const { GET } = handlers;
