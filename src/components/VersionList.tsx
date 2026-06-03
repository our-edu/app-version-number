import React, { useState, useCallback, useMemo } from "react";
import { useLanguage } from "../i18n/LanguageContext";

/**
 * Version data interface
 */
interface VersionData {
  id?: string | number;
  version: string;
  device_type: string;
  is_active: boolean;
  app_name?: string;
  created_at?: string;
  updated_at?: string;
  attributes?: VersionData;
}

/**
 * Confirm dialog state
 */
interface ConfirmDialog {
  open: boolean;
  title: string;
  message: string;
  type: "delete" | "disable";
  onConfirm: () => void;
}

/**
 * VersionList Component Props
 */
interface VersionListProps {
  selectedSchool?: string;
  selectedAppType?: string;
  versions?: VersionData[];
  loading?: boolean;
  error?: string | null;
  authToken?: string;
  onFetchVersions: (platform: string) => void;
  onToggleStatus: (versionData: Partial<VersionData>) => Promise<void>;
  onDeleteVersion: (versionId: string) => Promise<void>;
}

/**
 * VersionList Component
 * Displays a list of mobile app versions with filtering, toggle, multi-select, and bulk actions
 *
 * @component
 */
const VersionList: React.FC<VersionListProps> = ({
  selectedSchool,
  selectedAppType,
  versions = [],
  loading = false,
  error = null,
  authToken = "",
  onFetchVersions,
  onToggleStatus,
  onDeleteVersion,
}) => {
  const { t } = useLanguage();
  const [platform, setPlatform] = useState<string>("ios");
  const [togglingVersion, setTogglingVersion] = useState<string | null>(null);
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({
    open: false,
    title: "",
    message: "",
    type: "delete",
    onConfirm: () => {},
  });

  /**
   * Handles refresh button click
   */
  const handleRefresh = useCallback(() => {
    if (onFetchVersions) {
      onFetchVersions(platform);
    }
    setSelectedVersions(new Set());
  }, [platform, onFetchVersions]);

  /**
   * Handles platform selection change
   */
  const handlePlatformChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPlatform(e.target.value);
      setSelectedVersions(new Set());
    },
    []
  );

  /**
   * Formats version data from different API response formats
   */
  const formatVersionData = useCallback((version: VersionData): VersionData => {
    const base = version?.attributes ? { ...version, ...version.attributes } : version;
    if (!base.device_type && (base as any).type) {
      return { ...base, device_type: (base as any).type };
    }
    return base;
  }, []);

  /**
   * Get a unique key for a version
   */
  const getVersionKey = useCallback((versionData: VersionData): string => {
    return versionData.id ? String(versionData.id) : `${versionData.version}-${versionData.device_type}`;
  }, []);

  /**
   * Toggles the active status of a version
   */
  const handleToggleStatus = useCallback(
    async (versionData: VersionData) => {
      if (!onToggleStatus || togglingVersion) return;

      const versionKey = `${versionData.version}-${versionData.device_type}`;
      setTogglingVersion(versionKey);
      try {
        await onToggleStatus({
          version: versionData.version,
          device_type: versionData.device_type,
          is_active: !versionData.is_active,
        });
        await handleRefresh();
      } catch (err) {
        console.error("Failed to toggle status:", err);
      } finally {
        setTogglingVersion(null);
      }
    },
    [onToggleStatus, togglingVersion, handleRefresh]
  );

  /**
   * Opens the custom confirm dialog
   */
  const openConfirmDialog = useCallback(
    (title: string, message: string, type: "delete" | "disable", onConfirm: () => void) => {
      setConfirmDialog({ open: true, title, message, type, onConfirm });
    },
    []
  );

  /**
   * Closes the confirm dialog
   */
  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  }, []);

  /**
   * Handles confirming the dialog action
   */
  const handleDialogConfirm = useCallback(() => {
    confirmDialog.onConfirm();
    closeConfirmDialog();
  }, [confirmDialog, closeConfirmDialog]);

  /**
   * Handles deleting a single version
   */
  const handleDeleteVersion = useCallback(
    (versionData: VersionData) => {
      if (!onDeleteVersion || deletingVersion) return;

      const versionId = versionData.id;
      if (!versionId) return;

      if (!authToken) {
        openConfirmDialog(
          "⚠️",
          t.tokenRequiredForDelete,
          "delete",
          () => {}
        );
        return;
      }

      openConfirmDialog(
        t.deleteVersion,
        t.confirmDeleteVersion,
        "delete",
        async () => {
          const versionKey = `${versionData.version}-${versionData.device_type}`;
          setDeletingVersion(versionKey);
          try {
            await onDeleteVersion(String(versionId));
            await handleRefresh();
          } catch (err) {
            console.error("Failed to delete version:", err);
          } finally {
            setDeletingVersion(null);
          }
        }
      );
    },
    [onDeleteVersion, deletingVersion, authToken, handleRefresh, t, openConfirmDialog]
  );

  /**
   * Toggle selection of a single version
   */
  const toggleVersionSelection = useCallback((key: string) => {
    setSelectedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /**
   * Select or deselect all versions
   */
  const toggleSelectAll = useCallback(() => {
    if (selectedVersions.size === versions.length) {
      setSelectedVersions(new Set());
    } else {
      const allKeys = new Set(
        versions.map((v) => {
          const d = formatVersionData(v);
          return getVersionKey(d);
        })
      );
      setSelectedVersions(allKeys);
    }
  }, [selectedVersions.size, versions, formatVersionData, getVersionKey]);

  /**
   * Bulk disable selected versions
   */
  const handleBulkDisable = useCallback(() => {
    if (selectedVersions.size === 0) return;

    openConfirmDialog(
      t.bulkDisable,
      `${t.confirmBulkDisable} (${selectedVersions.size} ${t.selectedCount})`,
      "disable",
      async () => {
        setBulkActionLoading(true);
        try {
          const promises = versions
            .filter((v) => {
              const d = formatVersionData(v);
              return selectedVersions.has(getVersionKey(d)) && d.is_active;
            })
            .map((v) => {
              const d = formatVersionData(v);
              return onToggleStatus({
                version: d.version,
                device_type: d.device_type,
                is_active: false,
              });
            });
          await Promise.all(promises);
          setSelectedVersions(new Set());
          await handleRefresh();
        } catch (err) {
          console.error("Bulk disable failed:", err);
        } finally {
          setBulkActionLoading(false);
        }
      }
    );
  }, [selectedVersions, versions, formatVersionData, getVersionKey, onToggleStatus, handleRefresh, t, openConfirmDialog]);

  /**
   * Bulk delete selected versions
   */
  const handleBulkDelete = useCallback(() => {
    if (selectedVersions.size === 0) return;

    if (!authToken) {
      openConfirmDialog("⚠️", t.tokenRequiredForDelete, "delete", () => {});
      return;
    }

    openConfirmDialog(
      t.bulkDelete,
      `${t.confirmBulkDelete} (${selectedVersions.size} ${t.selectedCount})`,
      "delete",
      async () => {
        setBulkActionLoading(true);
        try {
          const promises = versions
            .filter((v) => {
              const d = formatVersionData(v);
              return selectedVersions.has(getVersionKey(d)) && d.id;
            })
            .map((v) => {
              const d = formatVersionData(v);
              return onDeleteVersion(String(d.id));
            });
          await Promise.all(promises);
          setSelectedVersions(new Set());
          await handleRefresh();
        } catch (err) {
          console.error("Bulk delete failed:", err);
        } finally {
          setBulkActionLoading(false);
        }
      }
    );
  }, [selectedVersions, versions, formatVersionData, getVersionKey, onDeleteVersion, authToken, handleRefresh, t, openConfirmDialog]);

  const isSelectionComplete = useMemo(
    () => Boolean(selectedSchool && selectedAppType),
    [selectedSchool, selectedAppType]
  );

  const shouldShowData = useMemo(
    () => !loading && !error && versions.length > 0,
    [loading, error, versions.length]
  );

  const shouldShowEmptyState = useMemo(
    () => isSelectionComplete && !loading && !error && versions.length === 0,
    [isSelectionComplete, loading, error, versions.length]
  );

  const allSelected = versions.length > 0 && selectedVersions.size === versions.length;

  /**
   * Renders a single version card
   */
  const renderVersionCard = useCallback(
    (version: VersionData, index: number) => {
      const versionData = formatVersionData(version);
      const versionKey = getVersionKey(versionData);
      const displayKey = `${versionData.version}-${versionData.device_type}`;
      const isToggling = togglingVersion === displayKey;
      const isDeleting = deletingVersion === displayKey;
      const isSelected = selectedVersions.has(versionKey);

      return (
        <div
          key={versionData.id || index}
          className={`version-card ${isSelected ? "version-card-selected" : ""}`}
        >
          <div className="version-header">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleVersionSelection(versionKey)}
                className="version-checkbox"
                aria-label={`Select ${versionData.version}`}
              />
              <div className="version-number">
                {t.version}: {versionData.version || "Unknown"}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span
                className={`status-badge ${
                  versionData.is_active ? "status-active" : "status-inactive"
                } ${isToggling ? "status-toggling" : ""}`}
                onClick={() => !isToggling && handleToggleStatus(versionData)}
                style={{
                  cursor: isToggling ? "wait" : "pointer",
                  userSelect: "none",
                  opacity: isToggling ? 0.6 : 1,
                }}
                title={isToggling ? t.togglingStatus : t.clickToToggle}
                role="button"
                tabIndex={0}
                onKeyPress={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    !isToggling && handleToggleStatus(versionData);
                  }
                }}
              >
                {isToggling
                  ? t.updating
                  : versionData.is_active
                  ? t.active
                  : t.inactive}
              </span>

              <button
                className="btn-delete-version"
                onClick={() => !isDeleting && handleDeleteVersion(versionData)}
                disabled={isDeleting}
                title={t.deleteVersion}
                aria-label={t.deleteVersion}
              >
                {isDeleting ? "⏳" : "🗑️"}
              </button>
            </div>
          </div>

          <div className="version-details">
            <div>
              <strong>{t.app}:</strong>{" "}
              {versionData.app_name || selectedAppType}
            </div>
            <div>
              <strong>{t.platform}:</strong> {versionData.device_type || platform}
            </div>
            {versionData.created_at && (
              <div>
                <strong>{t.created}:</strong>{" "}
                {new Date(versionData.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            )}
            {versionData.updated_at && (
              <div>
                <strong>{t.updated}:</strong>{" "}
                {new Date(versionData.updated_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            )}
          </div>
        </div>
      );
    },
    [
      formatVersionData,
      getVersionKey,
      selectedAppType,
      platform,
      togglingVersion,
      deletingVersion,
      selectedVersions,
      handleToggleStatus,
      handleDeleteVersion,
      toggleVersionSelection,
      t,
    ]
  );

  return (
    <div className="tab-content active">
      <h2>{t.appVersionsTitle}</h2>

      <div className="platform-filter">
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label htmlFor="platformSelect">{t.platform}:</label>
          <select
            id="platformSelect"
            value={platform}
            onChange={handlePlatformChange}
            aria-label={t.platform}
          >
            <option value="ios">{t.ios}</option>
            <option value="android">{t.android}</option>
            <option value="huawei">{t.huawei}</option>
          </select>
        </div>
        <button
          onClick={handleRefresh}
          className="btn btn-secondary"
          disabled={!isSelectionComplete || loading}
          aria-label={t.refreshData}
        >
          {t.refreshData}
        </button>
      </div>

      {loading && (
        <div className="loading" role="status" aria-live="polite">
          {t.loadingVersions}
        </div>
      )}

      {error && (
        <div className="error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {!isSelectionComplete && !loading && (
        <div className="no-data" role="status">
          {t.selectConfigMessage}
        </div>
      )}

      {shouldShowEmptyState && (
        <div className="no-data" role="status">
          {t.noVersionsFound}
        </div>
      )}

      {shouldShowData && (
        <>
          {/* Bulk action bar */}
          <div className="bulk-action-bar">
            <div className="bulk-action-left">
              <label className="select-all-label">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="version-checkbox"
                />
                <span>{allSelected ? t.deselectAll : t.selectAll}</span>
              </label>
              {selectedVersions.size > 0 && (
                <span className="selected-count-badge">
                  {selectedVersions.size} {t.selectedCount}
                </span>
              )}
            </div>
            {selectedVersions.size > 0 && (
              <div className="bulk-action-buttons">
                <button
                  className="btn-bulk btn-bulk-disable"
                  onClick={handleBulkDisable}
                  disabled={bulkActionLoading}
                >
                  {bulkActionLoading ? t.bulkActionInProgress : t.bulkDisable}
                </button>
                <button
                  className="btn-bulk btn-bulk-delete"
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                >
                  {bulkActionLoading ? t.bulkActionInProgress : t.bulkDelete}
                </button>
              </div>
            )}
          </div>

          <div className="versions-container">
            {versions.map(renderVersionCard)}
          </div>
        </>
      )}

      {/* Custom Confirm Dialog */}
      {confirmDialog.open && (
        <div className="confirm-overlay" onClick={closeConfirmDialog}>
          <div
            className="confirm-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`confirm-dialog-header ${confirmDialog.type === "delete" ? "confirm-header-delete" : "confirm-header-disable"}`}>
              <h3>{confirmDialog.title}</h3>
              <button className="btn-close" onClick={closeConfirmDialog}>
                ✕
              </button>
            </div>
            <div className="confirm-dialog-body">
              <p>{confirmDialog.message}</p>
            </div>
            <div className="confirm-dialog-actions">
              <button
                className="btn-secondary-outline"
                onClick={closeConfirmDialog}
              >
                {t.cancel}
              </button>
              <button
                className={`btn-confirm ${confirmDialog.type === "delete" ? "btn-confirm-delete" : "btn-confirm-disable"}`}
                onClick={handleDialogConfirm}
              >
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(VersionList);
