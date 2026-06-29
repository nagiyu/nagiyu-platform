'use client';

import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export interface NavigationItem {
  /**
   * メニュー項目のラベル
   */
  label: string;

  /**
   * リンク先のURL
   */
  href: string;

  /**
   * アイコン（オプション）
   */
  icon?: React.ReactNode;

  /**
   * サブメニュー（ドロップダウン用）
   */
  children?: NavigationItem[];

  /**
   * 必要な権限（オプション）
   */
  requiredPermission?: string;
}

export interface HeaderProps {
  /**
   * The title to display in the header
   * @default "Nagiyu Platform"
   */
  title?: string;
  /**
   * The href to navigate to when clicking the title
   * @default "/"
   */
  href?: string;
  /**
   * The aria-label for accessibility
   * @default "{title} - Navigate to homepage"
   */
  ariaLabel?: string;

  /**
   * ナビゲーションメニュー項目
   */
  navigationItems?: NavigationItem[];

  /**
   * ユーザー情報。指定するとアバターがアカウントメニューのトリガーになる。
   */
  user?: {
    name: string;
    email?: string;
    avatar?: string;
  };

  /**
   * ログアウトハンドラー。
   * user が指定されている場合はアカウントメニュー内の項目として表示される。
   * user が指定されていない場合は従来どおり単独のボタンとして表示される（後方互換）。
   */
  onLogout?: () => void;

  /**
   * ログアウトボタンのラベル
   * @default "ログアウト"
   */
  logoutLabel?: string;

  /**
   * 退会・データ削除ハンドラー。
   * user が指定されている場合のみアカウントメニュー内に表示される。
   */
  onDeleteAccount?: () => void;

  /**
   * 退会・データ削除ボタンのラベル
   * @default "退会・データ削除"
   */
  deleteAccountLabel?: string;
}

/**
 * デスクトップ用のナビゲーションメニュー項目コンポーネント
 */
function NavigationMenuItem({ item }: { item: NavigationItem }) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (!item.children) {
    return (
      <Button
        color="inherit"
        href={item.href}
        startIcon={item.icon}
        sx={{ mx: 0.5 }}
        aria-label={item.label}
      >
        {item.label}
      </Button>
    );
  }

  return (
    <>
      <Button
        color="inherit"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        endIcon={<ArrowDropDownIcon />}
        startIcon={item.icon}
        sx={{ mx: 0.5 }}
        aria-label={`${item.label} メニュー`}
        aria-haspopup="true"
        aria-expanded={Boolean(anchorEl)}
      >
        {item.label}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          list: {
            'aria-label': `${item.label} サブメニュー`,
          },
        }}
      >
        {item.children.map((child) => (
          <MenuItem
            key={child.label}
            component="a"
            href={child.href}
            onClick={() => setAnchorEl(null)}
          >
            {child.icon && <ListItemIcon>{child.icon}</ListItemIcon>}
            {child.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/**
 * モバイル用のDrawerメニュー項目コンポーネント
 */
function NavigationDrawerItem({ item, onClose }: { item: NavigationItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);

  if (!item.children) {
    return (
      <ListItem disablePadding>
        <ListItemButton component="a" href={item.href} onClick={onClose}>
          {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
          <ListItemText primary={item.label} />
        </ListItemButton>
      </ListItem>
    );
  }

  return (
    <>
      <ListItem disablePadding>
        <ListItemButton onClick={() => setOpen(!open)}>
          {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
          <ListItemText primary={item.label} />
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItemButton>
      </ListItem>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {item.children.map((child) => (
            <ListItem key={child.label} disablePadding>
              <ListItemButton sx={{ pl: 4 }} component="a" href={child.href} onClick={onClose}>
                {child.icon && <ListItemIcon>{child.icon}</ListItemIcon>}
                <ListItemText primary={child.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Collapse>
    </>
  );
}

/**
 * アカウントメニューコンポーネント（user 指定時のアバタートリガー付きメニュー）。
 *
 * - onLogout があれば「ログアウト」項目を表示
 * - onDeleteAccount があれば「退会・データ削除」項目を表示（Divider で区切る）
 */
function AccountMenu({
  user,
  onLogout,
  logoutLabel,
  onDeleteAccount,
  deleteAccountLabel,
}: {
  user: NonNullable<HeaderProps['user']>;
  onLogout?: () => void;
  logoutLabel: string;
  onDeleteAccount?: () => void;
  deleteAccountLabel: string;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isOpen = Boolean(anchorEl);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleLogout = () => {
    handleClose();
    onLogout?.();
  };

  const handleDeleteAccount = () => {
    handleClose();
    onDeleteAccount?.();
  };

  return (
    <>
      <IconButton
        onClick={handleOpen}
        sx={{ ml: 2, p: 0.5 }}
        aria-label="アカウントメニュー"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'account-menu' : undefined}
      >
        <Avatar src={user.avatar} alt={user.name} sx={{ width: 32, height: 32 }}>
          {user.name && user.name.length > 0 ? user.name[0] : '?'}
        </Avatar>
      </IconButton>
      <Menu
        id="account-menu"
        anchorEl={anchorEl}
        open={isOpen}
        onClose={handleClose}
        slotProps={{
          list: {
            'aria-label': 'アカウントメニュー',
          },
        }}
      >
        {/* ユーザー名・メール表示エリア */}
        <Box sx={{ px: 2, py: 1, pointerEvents: 'none' }}>
          {/* メニュー内に可視テキストとして名前・メールを表示する。
              トリガーの IconButton に既に「アカウントメニュー」ラベルがあるため、
              ここでは aria-label を付けず可視テキストをそのまま読み上げさせる。 */}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user.name}
          </Typography>
          {user.email && (
            <Typography variant="caption" color="text.secondary">
              {user.email}
            </Typography>
          )}
        </Box>
        <Divider />
        {onLogout && (
          <MenuItem onClick={handleLogout} data-testid="account-menu-logout">
            {logoutLabel}
          </MenuItem>
        )}
        {onDeleteAccount && (
          <MenuItem onClick={handleDeleteAccount} data-testid="account-menu-delete-account">
            {deleteAccountLabel}
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

export default function Header({
  title = 'Nagiyu Platform',
  href = '/',
  ariaLabel,
  navigationItems,
  user,
  onLogout,
  logoutLabel = 'ログアウト',
  onDeleteAccount,
  deleteAccountLabel = '退会・データ削除',
}: HeaderProps) {
  const defaultAriaLabel = `${title} - Navigate to homepage`;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleDrawerOpen = () => setDrawerOpen(true);
  const handleDrawerClose = () => setDrawerOpen(false);

  return (
    <>
      <AppBar position="static" color="primary">
        <Toolbar
          sx={{
            minHeight: { xs: 56, sm: 64 },
          }}
        >
          {/* モバイル: ハンバーガーメニュー */}
          {navigationItems && navigationItems.length > 0 && (
            <IconButton
              edge="start"
              color="inherit"
              onClick={handleDrawerOpen}
              sx={{ mr: 2, display: { xs: 'block', md: 'none' } }}
              aria-label="メニューを開く"
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* ロゴ/タイトル */}
          <Typography
            variant="h6"
            component="a"
            href={href}
            sx={{
              textDecoration: 'none',
              color: 'inherit',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label={ariaLabel || defaultAriaLabel}
          >
            {title}
          </Typography>

          {/* デスクトップ: 横並びメニュー */}
          {navigationItems && navigationItems.length > 0 && (
            <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, ml: 4 }}>
              {navigationItems.map((item) => (
                <NavigationMenuItem key={item.label} item={item} />
              ))}
            </Box>
          )}

          {/* スペーサー（ナビゲーションがない場合） */}
          {(!navigationItems || navigationItems.length === 0) && <Box sx={{ flexGrow: 1 }} />}

          {/* ユーザー指定あり: アバターをトリガーにしたアカウントメニュー */}
          {user ? (
            <AccountMenu
              user={user}
              onLogout={onLogout}
              logoutLabel={logoutLabel}
              onDeleteAccount={onDeleteAccount}
              deleteAccountLabel={deleteAccountLabel}
            />
          ) : (
            /* ユーザー指定なし・onLogout のみ: 後方互換のため単独ボタンを表示 */
            onLogout && (
              <Button color="inherit" onClick={onLogout} sx={{ ml: 2 }} aria-label={logoutLabel}>
                {logoutLabel}
              </Button>
            )
          )}
        </Toolbar>
      </AppBar>

      {/* モバイル: Drawer */}
      {navigationItems && navigationItems.length > 0 && (
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={handleDrawerClose}
          ModalProps={{
            keepMounted: true, // モバイルパフォーマンス向上のため
          }}
        >
          <Box
            sx={{ width: 250 }}
            role="navigation"
            aria-label="ナビゲーションメニュー"
            onClick={(e) => {
              // ネストクリックでは閉じない（'a' 要素への最近接クリックのみ閉じる）
              const target = e.target as HTMLElement;
              if (target.closest('a')) {
                handleDrawerClose();
              }
            }}
          >
            <List>
              {navigationItems.map((item) => (
                <NavigationDrawerItem key={item.label} item={item} onClose={handleDrawerClose} />
              ))}
            </List>
          </Box>
        </Drawer>
      )}
    </>
  );
}
