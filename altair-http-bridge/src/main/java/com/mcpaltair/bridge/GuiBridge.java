package com.mcpaltair.bridge;

import com.rapidminer.Process;

import java.lang.reflect.Method;

/**
 * EXPERIMENTAL: reads/replaces the process currently open in the Studio GUI.
 *
 * Implemented entirely through reflection (rather than direct imports of
 * com.rapidminer.gui.MainFrame) on purpose: this project could not compile-test
 * against a real Altair AI Studio jar in this session (no JDK in the build
 * environment), and getting a GUI method name wrong here must fail at *request*
 * time with a clear error — not break compilation of the whole extension jar,
 * which would also take down the fully-reliable process-run and repository
 * endpoints. If this throws "unsupported", open a process in Studio, then use
 * jshell/javap against "<ALTAIR_HOME>\lib\rapidminer-studio-core-*.jar"'s
 * com/rapidminer/gui/MainFrame.class to find the real accessor and hard-code it here.
 */
final class GuiBridge {

    private GuiBridge() {}

    static String currentProcessXml() throws Exception {
        Object mainFrame = getMainFrame();
        Method getProcess = mainFrame.getClass().getMethod("getProcess");
        Object process = getProcess.invoke(mainFrame);
        if (process == null) throw new IllegalStateException("No process is currently open in Studio.");
        Method getRootOperator = process.getClass().getMethod("getRootOperator");
        Object rootOperator = getRootOperator.invoke(process);
        Method getXML = rootOperator.getClass().getMethod("getXML", boolean.class);
        return (String) getXML.invoke(rootOperator, true);
    }

    static void openProcessXml(String xml) throws Exception {
        Object mainFrame = getMainFrame();
        Process process = new Process(xml);
        // Try the most likely method names in order; whichever exists on this
        // version's MainFrame wins.
        for (String candidate : new String[] {"setProcess", "setOpenedProcess", "showProcess"}) {
            try {
                Method m = mainFrame.getClass().getMethod(candidate, Process.class);
                m.invoke(mainFrame, process);
                return;
            } catch (NoSuchMethodException ignored) {
                // try next candidate
            }
        }
        throw new UnsupportedOperationException(
            "Could not find a MainFrame method to open a process on this Altair AI Studio version. "
                + "See GuiBridge.java for how to add the correct method name."
        );
    }

    private static Object getMainFrame() throws Exception {
        Class<?> guiClass = Class.forName("com.rapidminer.gui.RapidMinerGUI");
        Method getMainFrame = guiClass.getMethod("getMainFrame");
        Object mainFrame = getMainFrame.invoke(null);
        if (mainFrame == null) {
            throw new IllegalStateException("Studio is not running with a GUI (batch mode has no MainFrame).");
        }
        return mainFrame;
    }
}
