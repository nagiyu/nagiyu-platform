/** サービス slug → 実際の URL のマッピング定数 */
export const SERVICE_URLS: Record<string, string> = {
    tools: 'https://tools.nagiyu.com',
    'quick-clip': 'https://quick-clip.nagiyu.com',
    'codec-converter': 'https://codec-converter.nagiyu.com',
    'stock-tracker': 'https://stock-tracker.nagiyu.com',
    'niconico-mylist-assistant': 'https://niconico-mylist-assistant.nagiyu.com',
    'share-together': 'https://share-together.nagiyu.com',
    auth: 'https://auth.nagiyu.com',
    admin: 'https://admin.nagiyu.com',
};

/** サービス slug → サービス表示名のマッピング定数 */
export const SERVICE_NAMES: Record<string, string> = {
    tools: 'Tools',
    'quick-clip': 'Quick Clip',
    'codec-converter': 'Codec Converter',
    'stock-tracker': 'Stock Tracker',
    'niconico-mylist-assistant': 'niconico-mylist-assistant',
    'share-together': 'Share Together',
    auth: 'Auth',
    admin: 'Admin',
};
