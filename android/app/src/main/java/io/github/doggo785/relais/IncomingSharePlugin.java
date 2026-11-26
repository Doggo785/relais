package io.github.doggo785.relais;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Texte partagé vers Relais depuis une autre appli (ex. un lieu Google Maps).
 * Le JS lit le texte en attente avec take() au démarrage et à chaque évènement "share".
 */
@CapacitorPlugin(name = "IncomingShare")
public class IncomingSharePlugin extends Plugin {
    private String pending;

    @Override
    public void load() {
        pending = textOf(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        String text = textOf(intent);
        if (text == null) return;
        pending = text;
        notifyListeners("share", new JSObject(), true);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", pending);
        pending = null;
        call.resolve(result);
    }

    private static String textOf(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType())) {
            return null;
        }
        return intent.getStringExtra(Intent.EXTRA_TEXT);
    }
}
