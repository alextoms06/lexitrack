import { isConfiguredAppUrl, LEXITRACK_APP_URL } from "./appConfig.js";

export function createConfirmationActions({
  appUrl = LEXITRACK_APP_URL,
  openTab,
  dismiss,
  onConfigurationRequired,
  onError
}) {
  return {
    onOk() {
      dismiss();
    },
    async onGoToApp() {
      if (!isConfiguredAppUrl(appUrl)) {
        onConfigurationRequired();
        return false;
      }

      try {
        await openTab(appUrl);
        dismiss();
        return true;
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
        return false;
      }
    }
  };
}