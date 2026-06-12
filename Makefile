NAME    := linkfilter
ZIP     := $(NAME).zip
SOURCES := manifest.json src

.PHONY: build pack clean

## build: vanilla JS, nothing to compile. Load the repo root as an unpacked
## extension in chrome://extensions (Developer mode → Load unpacked).
build:
	@echo "No build step needed."
	@echo "Load unpacked: chrome://extensions → enable Developer mode → Load unpacked → select $(CURDIR)"

## pack: zip the extension into $(ZIP) for distribution / drag-drop install.
pack: clean
	zip -r $(ZIP) $(SOURCES) -x '*.DS_Store'
	@echo "Created $(ZIP)."
	@echo "Install: chrome://extensions → enable Developer mode → drag $(ZIP) onto the page,"
	@echo "         or unzip it and use 'Load unpacked'."

## clean: remove build artifacts.
clean:
	rm -f $(ZIP)
