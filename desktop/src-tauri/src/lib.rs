//! Rushd desktop: a native window around the hosted web app at https://therushd.com.
//!
//! Security model (see desktop/README.md):
//! - The remote site gets NO Tauri capabilities and no custom commands exist, so it
//!   cannot call into the native side.
//! - Every navigation is checked here, in Rust. Only https://therushd.com (and the
//!   bundled local launcher/offline page) may load in the window. Other http(s),
//!   mailto: and tel: links are handed to the operating system's default handler;
//!   everything else is blocked.
//! - Popups (`window.open`, `target="_blank"`) never create a new webview: Rushd
//!   URLs open in the main window, anything else opens in the system browser.
//! - Devtools are only available in debug builds.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// The only remote origin allowed to load inside the app window.
const APP_HOST: &str = "therushd.com";
const APP_ORIGIN: &str = "https://therushd.com";
/// Where the app lands after the connectivity check on the launcher page.
const START_PATH: &str = "/dashboard";
const MAIN_WINDOW: &str = "main";

/// Origin of the bundled `dist/` files (launcher + offline page).
#[cfg(windows)]
const LOCAL_ORIGIN: &str = "https://tauri.localhost";
#[cfg(not(windows))]
const LOCAL_ORIGIN: &str = "tauri://localhost";

fn is_app_url(url: &Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some(APP_HOST) && url.port().is_none()
}

fn is_local_url(url: &Url) -> bool {
    // Compared field by field: `tauri://` is not a "special" scheme, so
    // `Url::origin()` would be opaque and never compare equal.
    match Url::parse(LOCAL_ORIGIN) {
        Ok(local) => {
            url.scheme() == local.scheme()
                && url.host_str() == local.host_str()
                && url.port() == local.port()
        }
        Err(_) => false,
    }
}

/// Frame-level loads WebKit reports through the navigation handler on macOS
/// (it fires for iframes too). These never leave the app's own content.
fn is_inert_frame_url(url: &Url) -> bool {
    match url.scheme() {
        "about" => matches!(url.path(), "blank" | "srcdoc"),
        // blob: URLs created by the Rushd page itself (e.g. generated exports).
        "blob" => Url::parse(url.path()).map(|inner| is_app_url(&inner)).unwrap_or(false),
        _ => false,
    }
}

fn is_external_openable(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http" | "mailto" | "tel")
}

/// Hands a URL to the OS default handler. Deduplicates bursts (WebKit can report the
/// same click through both the navigation and the new-window handlers) and stops a
/// misbehaving page from spamming browser tabs.
fn open_externally<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    static LAST_OPEN: Mutex<Option<Instant>> = Mutex::new(None);
    {
        let mut last = LAST_OPEN.lock().unwrap_or_else(|e| e.into_inner());
        if last.is_some_and(|t| t.elapsed() < Duration::from_millis(1000)) {
            return;
        }
        *last = Some(Instant::now());
    }
    if let Err(err) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("[rushd] could not open {url} externally: {err}");
    }
}

/// URL of the bundled launcher page. It checks that Rushd is reachable and then
/// redirects to `next` (a path on therushd.com), or shows the offline page.
fn launcher_url(next_path: Option<&str>) -> Url {
    let mut url = Url::parse(LOCAL_ORIGIN)
        .and_then(|u| u.join("index.html"))
        .expect("valid local origin");
    if let Some(next) = next_path {
        url.query_pairs_mut().append_pair("next", next);
    }
    url
}

/// Reloads through the launcher so a lost connection shows the offline page
/// instead of a blank window, and returns to the same Rushd page when online.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn reload<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let next = window.url().ok().filter(is_app_url).map(|u| {
        let mut path = u.path().to_string();
        if let Some(q) = u.query() {
            path.push('?');
            path.push_str(q);
        }
        if let Some(f) = u.fragment() {
            path.push('#');
            path.push_str(f);
        }
        path
    });
    let _ = window.navigate(launcher_url(next.as_deref()));
}

#[cfg(target_os = "macos")]
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};

    let about = AboutMetadata {
        name: Some("Rushd".into()),
        version: Some(app.package_info().version.to_string()),
        copyright: Some("Copyright © 2026 Rushd".into()),
        website: Some(APP_ORIGIN.into()),
        website_label: Some("therushd.com".into()),
        ..Default::default()
    };
    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    let home = MenuItem::with_id(app, "home", "Go to Dashboard", true, Some("CmdOrCtrl+Shift+H"))?;

    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "Rushd",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Rushd"), Some(about))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            // Needed so copy/paste/select-all shortcuts work inside the web view.
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &reload,
                    &home,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
        ],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(build_menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "reload" => reload(app),
            "home" => {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                    let _ = window.navigate(launcher_url(Some(START_PATH)));
                }
            }
            _ => {}
        });

    builder
        .setup(|app| {
            let nav_app = app.handle().clone();
            let popup_app = app.handle().clone();

            WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
                .title("Rushd")
                .inner_size(1280.0, 820.0)
                .min_inner_size(960.0, 640.0)
                .center()
                .devtools(cfg!(debug_assertions))
                // Serve the bundled pages from https://tauri.localhost on Windows (secure context).
                .use_https_scheme(true)
                // Let the web app handle file drag-and-drop (uploads) itself.
                .disable_drag_drop_handler()
                .on_navigation(move |url| {
                    if is_app_url(url) || is_local_url(url) || is_inert_frame_url(url) {
                        return true;
                    }
                    if is_external_openable(url) {
                        open_externally(&nav_app, url);
                    }
                    false
                })
                .on_new_window(move |url, _features| {
                    if is_app_url(&url) {
                        if let Some(window) = popup_app.get_webview_window(MAIN_WINDOW) {
                            let _ = window.navigate(url);
                        }
                    } else if is_external_openable(&url) {
                        open_externally(&popup_app, &url);
                    }
                    NewWindowResponse::Deny
                })
                .on_download(|_webview, event| match event {
                    // Allow downloads served by Rushd (or generated by its page); they
                    // land in the user's Downloads folder.
                    DownloadEvent::Requested { url, .. } => {
                        is_app_url(&url) || is_inert_frame_url(&url) || url.scheme() == "data"
                    }
                    _ => true,
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Rushd");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn app_urls() {
        assert!(is_app_url(&u("https://therushd.com/dashboard?x=1")));
        assert!(!is_app_url(&u("http://therushd.com/dashboard")));
        assert!(!is_app_url(&u("https://therushd.com:8443/")));
        assert!(!is_app_url(&u("https://evil.therushd.com/")));
        assert!(!is_app_url(&u("https://therushd.com.evil.com/")));
        assert!(!is_app_url(&u("https://evil.com/?https://therushd.com")));
    }

    #[test]
    fn local_and_inert_urls() {
        assert!(is_local_url(&launcher_url(Some("/dashboard"))));
        assert!(!is_local_url(&u("https://example.com/index.html")));
        assert!(is_inert_frame_url(&u("about:blank")));
        assert!(is_inert_frame_url(&u("blob:https://therushd.com/1234-5678")));
        assert!(!is_inert_frame_url(&u("blob:https://evil.com/1234")));
        assert!(!is_inert_frame_url(&u("data:text/html,hi")));
        assert!(!is_inert_frame_url(&u("file:///etc/passwd")));
    }

    #[test]
    fn launcher_url_encodes_next() {
        let url = launcher_url(Some("/a b?c=d&e=f#g"));
        let next = url.query_pairs().find(|(k, _)| k == "next").unwrap().1;
        assert_eq!(next, "/a b?c=d&e=f#g");
    }
}
