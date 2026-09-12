# Desktop workflows

Dextana’s desktop layer connects agent work to operating-system capabilities. Harnest exposes one `desktop` tool. Discovery loads the operation schemas for the work at hand: time, files, workflows, processing, or device. Switching category replaces the loaded catalog for that chat. Native Harnest approvals authorise desktop operations; discovery never grants permission. Every persistent rule, job and rename preview belongs to its originating chat and appears in Context.

Open **Desktop** from the workspace selector, then choose **Workflows** to manage watched folders, processing jobs and rename history. **Scheduled jobs** remains the separate home for Harnest deferred and recurring work.

## Working across files and apps

Ask Dextana to open a project folder, workbook and dashboard together. Local documents use the system’s configured default application; HTTP(S) pages use the default browser. The response records success or failure separately for each target. Document handoff uses the same opening adapter. Opening a website does not upload documents to it.

For file organisation, Dextana first saves a preview listing every source and destination. Applying the preview is a separate approved operation. The desktop checks source identity and destination availability again before changing anything, never overwrites files, and records partial progress if a conflict interrupts the batch. The Desktop workflows panel offers **Review rename**, **Confirm rename**, **Review undo** and **Confirm undo**. Undo refuses files edited after their rename and destinations that now exist. Renames stay in the same folder and require a filesystem supporting hard links. Interrupted rename operations are reconciled on restart.

Completion notifications can point to the originating chat or a result file. Notification submission is not a guarantee that the operating system will display it: system notification preferences still apply.

## Watched folders

A watch consists of a selected folder, instructions, optional filename extensions, and an originating chat. Files already present form a baseline. Dextana polls nonrecursive regular files every three seconds and waits for a stable second observation before dispatching changes. Hidden files, symbolic links and common temporary downloads are ignored. Changes arriving while the app is closed are found after restart.

A watch starts ordinary Harnest activity work with the recorded instructions and the changed paths. Paths and documents are untrusted inputs, and downstream file, browser and integration actions retain their normal permissions. A watch processes up to 100 changed paths per dispatch. While a workflow runs, new output in the same folder becomes its next baseline to avoid a self-triggering loop; arrivals during that interval may therefore require a manual request. Put generated trackers outside the watched folder where practical.

Pause/resume preserves pending files. Failures stop automatic retries and retain pending paths for **Retry pending files**. If Dextana closes while work is in flight, review its chat before retrying because external actions may already have happened. Removing a watch cancels its current dispatch. Watching requires the Dextana process to run; it does not install a separate operating-system service.

## Local processing and power

The processing catalog reports processors actually detected on the device. Local jobs produce a new output file and never overwrite an existing one.

| Operation | Support | Output |
| --- | --- | --- |
| Index documents | Built in, using Dextana’s existing document readers; up to 100 files, 5 MB each | JSON containing extracted document text and tables |
| OCR an image | Installed Tesseract | TXT |
| Transcribe audio | Installed `whisper-cli`, a local model file and WAV input | TXT |
| Convert an office document | Installed LibreOffice | PDF, DOCX, XLSX or TXT, where the source supports conversion |

Indexing is a local text extraction index, not a vector search database. Supported readers include text, Markdown, CSV, XLSX, DOCX and PDF. Images need OCR first. Native processors are invoked directly with a fixed argument structure, without a shell. Input copies and intermediate output stay in a private temporary job directory; successful output is copied exclusively to the chosen destination. Optional native inputs are limited to 500 MB and final output to 100 MB. No processor or model is downloaded automatically.

Queued jobs persist. Running jobs interrupted by app shutdown are requeued after cancellation; an unclean crash marks them failed so a potentially completed output is reviewed before retrying. The Desktop workflows panel shows progress, errors, cancellation controls and an **Open result** action.

By default, battery power pauses new processing and watched-folder dispatch. Active local processing is cancelled and restarted from the beginning when external power returns. Already dispatched Harnest folder work finishes normally. The device category exposes current power status and an explicit setting to allow background processing on battery. These guarantees apply while Dextana is running; a sleeping or powered-off device cannot process files.
