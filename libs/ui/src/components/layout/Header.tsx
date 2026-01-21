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
   * ユーザー情報
   */
  user?: {
    name: string;
    email?: string;
    avatar?: string;
  };

  /**
   * ログアウトハンドラー
   */
  onLogout?: () => void;

  /**
   * ログアウトボタンのラベル
   * @default "ログアウト"
   */
  logoutLabel?: string;
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
        MenuListProps={{
          'aria-label': `${item.label} サブメニュー`,
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

export default function Header({
  title = 'Nagiyu Platform',
  href = '/',
  ariaLabel,
  navigationItems,
  user,
  onLogout,
  logoutLabel = 'ログアウト',
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

          {/* ユーザー情報 */}
          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
              <Avatar src={user.avatar} alt={user.name} sx={{ width: 32, height: 32, mr: 1 }}>
                {user.name && user.name.length > 0 ? user.name[0] : '?'}
              </Avatar>
              <Typography
                variant="body2"
                sx={{ display: { xs: 'none', sm: 'block' } }}
                aria-label={`ログイン中: ${user.name}`}
              >
                {user.name}
              </Typography>
            </Box>
          )}

          {/* ログアウトボタン */}
          {onLogout && (
            <Button color="inherit" onClick={onLogout} sx={{ ml: 2 }} aria-label={logoutLabel}>
              {logoutLabel}
            </Button>
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
            keepMounted: true, // Better mobile performance
          }}
        >
          <Box
            sx={{ width: 250 }}
            role="navigation"
            aria-label="ナビゲーションメニュー"
            onClick={(e) => {
              // Prevent closing on nested clicks - check for closest 'a' element
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
