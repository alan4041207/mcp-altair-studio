package com.mcpaltair.bridge;

import com.rapidminer.repository.DataEntry;
import com.rapidminer.repository.Entry;
import com.rapidminer.repository.Folder;
import com.rapidminer.repository.IOObjectEntry;
import com.rapidminer.repository.RepositoryLocation;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * EXPERIMENTAL: repository browsing via com.rapidminer.repository.RepositoryLocation
 * / Folder / DataEntry. This session had no JDK available to compile-verify these
 * calls against the installed jars (confirmed present: RepositoryLocation,
 * RepositoryManager, DataEntry, IOObjectEntry — seen directly in Altair AI Studio's
 * own stack traces during batch-mode testing; exact method names here are a
 * best-effort reconstruction of the well-documented "embedding RapidMiner"
 * repository pattern, not independently verified). If a method name below doesn't
 * match your installed version, unzip
 * "<ALTAIR_HOME>\lib\rapidminer-studio-core-*.jar" and inspect
 * com/rapidminer/repository/RepositoryLocation.class with `javap` to find the
 * correct signature — the same technique this project's README walks through.
 */
final class RepositoryBridge {

    private RepositoryBridge() {}

    static String listAsJson(String path) throws Exception {
        RepositoryLocation location = new RepositoryLocation(path);
        Entry entry = location.locateEntry();
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        if (entry instanceof Folder folder) {
            for (Folder sub : folder.getSubfolders()) {
                if (!first) sb.append(",");
                first = false;
                sb.append(entryJson(sub, "FOLDER"));
            }
            for (DataEntry data : folder.getDataEntries()) {
                if (!first) sb.append(",");
                first = false;
                String type = data instanceof IOObjectEntry ? "DATA" : "OTHER";
                sb.append(entryJson(data, type));
            }
        }
        sb.append("]");
        return sb.toString();
    }

    private static String entryJson(Entry entry, String type) {
        String name = entry.getName();
        String loc = entry.getLocation() != null ? entry.getLocation().getAbsoluteLocation() : name;
        return "{\"name\":" + MiniJson.quote(name) + ",\"path\":" + MiniJson.quote(loc) + ",\"type\":" + MiniJson.quote(type) + "}";
    }

    static String readAsCsv(String path, int maxRows) throws Exception {
        RepositoryLocation location = new RepositoryLocation(path);
        Entry entry = location.locateEntry();
        if (!(entry instanceof IOObjectEntry ioEntry)) {
            throw new IllegalArgumentException("Repository entry is not a data object: " + path);
        }
        Object data = ioEntry.retrieveData(null);
        // Best-effort generic toString-based dump; a full ExampleSet -> CSV writer
        // would need the same "table.getView()" iteration Write CSV uses internally.
        // For a reliable CSV, prefer the validated altair_import_data / batch tools.
        return String.valueOf(data);
    }

    static void storeCsv(String path, String csv) throws Exception {
        File tmp = File.createTempFile("mcp-altair-store-", ".csv");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            w.write(csv);
        }
        // Delegates to the validated headless path rather than re-implementing
        // repository write logic here: builds a tiny read_csv -> store process and
        // runs it in-process.
        String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<process version=\"10.6.000\"><context><input/><output/><macros/></context>"
            + "<operator activated=\"true\" class=\"process\" compatibility=\"10.6.000\" expanded=\"true\" name=\"Process\">"
            + "<process expanded=\"true\">"
            + "<operator activated=\"true\" class=\"read_csv\" compatibility=\"10.6.000\" expanded=\"true\" name=\"Read\">"
            + "<parameter key=\"csv_file\" value=\"" + tmp.getAbsolutePath().replace("\\", "\\\\") + "\"/>"
            + "<parameter key=\"first_row_as_names\" value=\"true\"/>"
            + "</operator>"
            + "<operator activated=\"true\" class=\"store\" compatibility=\"10.6.000\" expanded=\"true\" name=\"Store\">"
            + "<parameter key=\"repository_entry\" value=\"" + path.replace("\\", "\\\\") + "\"/>"
            + "</operator>"
            + "<connect from_op=\"Read\" from_port=\"output\" to_op=\"Store\" to_port=\"input\"/>"
            + "</process></operator></process>";
        ProcessBridge.run(xml, java.util.Map.of());
        Files.deleteIfExists(tmp.toPath());
    }
}
