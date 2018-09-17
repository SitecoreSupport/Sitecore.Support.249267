(function (speak) {
    speak.component(["bclCollection", "knockout", "underscore", "bclDragAndDrop", "/-/speak/v1/formsbuilder/assets/formservices.js"], function (Collection, ko, _, dragAndDrop, formServices) {
        var sectionWrapperSelector = ".sc-formdesign-container",
            fieldWrapperSelector = ".sc-formdesign-fieldcontainer", // now this is both section and field
            selectedClass = "selected",
            placeholderTextTemplate = "<div class='sc-text large weight-600-semi-bold sc-formdesign-placeholdertext'>{0}</div>",
            self;

        var prepareFieldContainer = function (element) {
            var $el = $(element);
            $el.on("click", self.selectElement);
            $el.attr("tabIndex", -1);
            $el.attr("hideFocus", true);
        };

        var getFieldAttributes = function (element) {
            var $el = $(element);

            var modelProperties = $.extend(true, {}, $el.data("sc-fielditem-properties"));
            modelProperties.itemId = $el.data("sc-fielditem-id") || "";

            return modelProperties;
        };

        var initFormFields = function () {
            var wrappers = $(fieldWrapperSelector);
            var fields = [];
            wrappers.each(function () {
                fields.push(getFieldAttributes(this));
                prepareFieldContainer(this);
            });

            return fields;
        };

        var getFormAttributes = function (el) {
            var formEl = el.find("form");
            if (!formEl.length) {
                console.log("form element not found");
            }

            var formAttributes = getFieldAttributes(formEl);
            return formAttributes;
        };

        return speak.extend({}, Collection.prototype, {
            name: "FormDesignBoard",
            
            initialized: function () {
                Collection.prototype.initialized.call(this);

                this.defineProperty("FormModel", null);
                this.defineProperty("SelectedItem", null);
                this.defineProperty("HasChanged", false);
                this.defineComputedProperty("CurrentLanguage", function () {
					
                    return this.FormModel ? this.FormModel.currentLanguage : "";
                });

                this.$el = $(this.el);
                self = this;

                speak.on("propertyGrid:Apply", this.applyPropertyChanges, this);
                speak.on("formPropertyGrid:Apply", this.applyFormPropertyChanges, this);

                this.PageFieldTypes = this.PageFieldTypes.split("|") || [];

                this.$pane = $(document).find('.sc-flx-content-pane');
                dragAndDrop.scrollable(this.$pane[0]);
                this.initializeMouseWheelListener();
            },

            initializeMouseWheelListener: function () {
                $(document).bind('mousewheel DOMMouseScroll', function (e) {
                    if ($(e.target).hasClass('sc-state-drag-allowed')) {
                        var delta = e.type === 'mousewheel' ? e.originalEvent.wheelDelta * -1 : e.originalEvent.detail * 40;
                        this.$pane.stop().animate({ scrollTop: delta + this.$pane.scrollTop() }, 100);
                        e.preventDefault();
                    }
                }.bind(this));
            },

            loadForm: function (languageName) {
                this.reset([]);
                this.SelectedItem = null;
                this.HasChanged = false;

                formServices.loadForm(this.FormId, this.FormMode, languageName || this.CurrentLanguage)
                    .then(this.loadFormSuccess.bind(this)).fail(this.loadFormError.bind(this));
            },

            loadFormError: function (xhr, textStatus, errorThrown) {
                this.$el.html("");
                this.FormModel = null;

                this.trigger("loadFormError", xhr, textStatus, errorThrown, this.FormModel);
                this.trigger("loadFormCompleted", this.FormModel);
            },

            loadFormSuccess: function (data) {
                this.$el.html(data);

                this.FormModel = getFormAttributes(this.$el);

                var fieldsJson = initFormFields();
                this.reset(fieldsJson);

                var formContainer = this.$el.find(sectionWrapperSelector + "[data-sc-fielditem-id='" + this.FormModel.itemId + "']");
                formContainer.addClass("sc-formdesign-formcontainer");
                formContainer.append(speak.Helpers.string.format(placeholderTextTemplate, this.PlaceholderText));
                
                if (this.FormMode === "new" && this.DefaultPageFieldType && this.DefaultPageFieldTemplate) {
                    var renderPlaceholder = document.createElement('div');
                    formContainer.append(renderPlaceholder);
                    this.renderField(renderPlaceholder, this.DefaultPageFieldTemplate, this.DefaultPageFieldType, true);
                }

                this.updateFormRootStyle();
                this.attachDropAndStyles(this.$el);

                this.trigger("loadFormCompleted", this.FormModel);
            },

            updateFormRootStyle: function () {
                var formEl = this.$el.find("form");
                formEl[formEl.has(fieldWrapperSelector).length ? "removeClass" : "addClass"]("sc-formdesign-form-empty");
            },

            applyFormPropertyChanges: function (formModel) {
                var $formEl = this.$el.find("form");
                $formEl.attr("class", formModel.model.cssClass);
                this.HasChanged = true;
            },

            attachDropAndStyles: function (el) {
                var dropTargets = el.find(sectionWrapperSelector);
                dropTargets.toArray().forEach(function (target) {
                    var $target = $(target);
                    dragAndDrop.droppable(target, {
                        allowDrop: this.allowDropHandler.bind(this),
                        onDrop: this.onDrop.bind(this)
                    });

                    var targetFieldParent = $target.closest(fieldWrapperSelector);
                    targetFieldParent.addClass("has-drop-area");

                    var targetItemId = target.getAttribute("data-sc-fielditem-id");
                    var fieldModel = this.findWhere({ itemId: targetItemId });
                    if (fieldModel && _.contains(this.PageFieldTypes, fieldModel.model.fieldTypeItemId)) {
                        targetFieldParent.addClass("sc-formdesign-pagecontainer");
                        $target.addClass("sc-formdesign-pagecontainer");
                        $target.append(speak.Helpers.string.format(placeholderTextTemplate, this.PagePlaceholderText));  
                    }
                }, this);
            },

            allowDropHandler: function (info) {
                var targetItemId = info.target.getAttribute("data-sc-fielditem-id");

                var dataFieldType = info.data.$itemId;
                if (!info.copy) {
                    var sourceItemId = info.data.getAttribute("data-sc-fielditem-id");
                    var fieldModel = this.findWhere({ itemId: sourceItemId });
                    dataFieldType = fieldModel ? fieldModel.model.fieldTypeItemId : "";
                }

                return (_.contains(this.PageFieldTypes, dataFieldType)) === (targetItemId === this.FormModel.itemId);
            },

            onDrop: function (event) {
                if (!event.copy) {
                    // a rendering was moved, so return it
                    this.HasChanged = true;
                    return event.el;
                }

                var fieldTemplate = event.data.FieldTemplate;
                var fieldType = event.data.$itemId;

                var renderPlaceholder = document.createElement('div');
                renderPlaceholder.className = "sc-formdesign-spinner-wrapper";
                renderPlaceholder.innerHTML = "<div class='sc-formdesign-spinner'></div>";

                this.renderField($(renderPlaceholder), fieldTemplate, fieldType);

                return renderPlaceholder;
            },

            renderField: function (droppedControl, fieldTemplate, fieldType, silentChange) {
                formServices.renderField(fieldType, fieldTemplate, this.CurrentLanguage)
                    .then(this.renderFieldSuccess.bind(this, droppedControl, silentChange))
                    .fail(this.renderFieldError.bind(this, droppedControl));
            },

            renderFieldError: function (droppedControl, xhr, textStatus, errorThrown) {
                droppedControl.fadeOut(function () {
                    droppedControl.remove();
                });

                this.trigger("renderFieldError", xhr, textStatus, errorThrown, droppedControl);
            },

            renderFieldSuccess: function (droppedControl, silentChange, data) {
                var fieldHtml = $(data);
                prepareFieldContainer(fieldHtml);

                $(droppedControl).replaceWith(fieldHtml);

                // add the field to the Collection Items
                var field = getFieldAttributes(fieldHtml);
                var fieldModel = this.add(field);

                if (!silentChange) {
                    this.HasChanged = true;
                }

                this.updateFormRootStyle();
                this.attachDropAndStyles(fieldHtml);

                this.trigger("renderFieldSuccess", fieldModel);
            },

            selectElement: function (event) {
                var element = $(this);
                var fieldItemId = element.data("sc-fielditem-id");
                var model = self.findWhere({ itemId: fieldItemId }) || null;

                if (document.activeElement) {
                    document.activeElement.blur();
                }

                self.trigger("selectElement", model, element);
                
                event.preventDefault();
                event.stopPropagation();
            },

            selectItem: function (model, element) {
                if (!element && model) {
                    element = this.$el.find(fieldWrapperSelector + "[data-sc-fielditem-id='" + model.itemId + "']");
                }

                if (this.SelectedItem === model) {
                    if (element) element.removeClass(selectedClass);
                    this.SelectedItem = null;
                }
                else {
                    if (this.SelectedItem) {
                        var selector = this.$el.find(fieldWrapperSelector + "[data-sc-fielditem-id='" + this.SelectedItem.itemId + "']");
                        selector.removeClass(selectedClass);
                    }

                    if (model && element) {
                        element.addClass(selectedClass);
                        element[0].focus();
                    }

                    this.SelectedItem = model;
                }
            },

            removeItem: function (model) {
                var fieldEl = this.$el.find(fieldWrapperSelector + "[data-sc-fielditem-id='" + model.itemId + "']");
                fieldEl.remove();

                this.HasChanged = true;
                this.updateFormRootStyle();
                if (this.SelectedItem === model) {
                    this.selectItem(null);
                }
            },

            isContainerWithFieldsSelected: function () {
                if (!this.SelectedItem) {
                    return false;
                }

                var sectionContainerElement = this.$el.find(sectionWrapperSelector + "[data-sc-fielditem-id='" + this.SelectedItem.itemId + "']");
                return sectionContainerElement.has(fieldWrapperSelector).length > 0;
            },

            applyPropertyChanges: function (fieldModel) {
                // the field model is already updated in the Items list
                var fieldData = ko.toJS(fieldModel.viewModel);
                // NOTE: ko.toJS(fieldModel.viewModel); makes a wrong conversion for arrays: http://stackoverflow.com/questions/24890168/ko-tojs-converting-array-to-object
                fieldData.model = JSON.stringify(fieldModel.viewModel.model());
                fieldData = JSON.stringify(fieldData);

                formServices.reloadField(fieldData, this.CurrentLanguage)
                    .then(this.reloadFieldSuccess.bind(this, fieldModel))
                    .fail(this.reloadFieldError.bind(this, fieldModel));
            },

            reloadFieldError: function (fieldModel, xhr, textStatus, errorThrown) {
                var fieldEl = this.$el.find(fieldWrapperSelector + "[data-sc-fielditem-id='" + fieldModel.itemId + "']");

                var field = getFieldAttributes(fieldEl);
                fieldModel.viewModel.model(field.model);

                this.trigger("reloadFieldError", xhr, textStatus, errorThrown, fieldModel);
            },

            reloadFieldSuccess: function (fieldModel, data) {
                this.HasChanged = true;
                var fieldHtml = $(data);
                prepareFieldContainer(fieldHtml);
                if (this.SelectedItem === fieldModel) {
                    fieldHtml.addClass(selectedClass);
                }

                var fieldEl = this.$el.find("[data-sc-fielditem-id='" + fieldModel.itemId + "']");
                if (fieldEl.length > 1) {
                    // field container and drop area have same value for sc-fielditem-id
                    var currentWrapper = fieldEl.filter(sectionWrapperSelector);
                    var reloadedWrapper = fieldHtml.find(sectionWrapperSelector + "[data-sc-fielditem-id='" + fieldModel.itemId + "']");

                    if (currentWrapper.length > 0 && reloadedWrapper.length > 0) {
                        // there should be only one drop area container per field
                        $(reloadedWrapper[0]).replaceWith(currentWrapper[0]);
                    }

                    fieldEl = fieldEl.filter(fieldWrapperSelector);
                }

                fieldEl.replaceWith(fieldHtml);

                var field = getFieldAttributes(fieldHtml);
                fieldModel.viewModel.model(field.model);

                this.attachDropAndStyles(fieldHtml);

                this.trigger("reloadFieldSuccess", fieldModel);
            },

            getFieldsData: function () {
                var structure = [];
                var sectionContainerElements = this.$el.find(sectionWrapperSelector);
                sectionContainerElements.each(function () {
                    var container = $(this);
                    var fieldItemId = container.data("sc-fielditem-id");
                    var childIds = container.children(fieldWrapperSelector)
                        .map(function () {
                            return $(this).data("sc-fielditem-id");
                        }).get();
                    structure.push({ id: fieldItemId, childIds: childIds });
                });

                var fieldsData = this.Items.map(function (fieldModel) {
                    var fieldData = ko.toJS(fieldModel.viewModel);

                    var fieldEl = this.$el.find(fieldWrapperSelector + "[data-sc-fielditem-id='" + fieldModel.itemId + "']");
                    // TODO: when handling delete field - remove field from items collection
                    if (!fieldEl.length) {
                        return null;
                    }

                    var parentContainer = fieldEl.closest(sectionWrapperSelector);
                    if (parentContainer.length > 0) {
                        fieldData.parentId = parentContainer.data("sc-fielditem-id");
                    } else {
                        fieldData.parentId = "";
                    }

                    var parentStructure = _.findWhere(structure, { id: fieldData.parentId });
                    var fieldIndex = parentStructure ? parentStructure.childIds.indexOf(fieldData.itemId) : -1;
                    fieldData.sortOrder = fieldIndex > 0 ? fieldIndex * 100 : 0;

                    return fieldData;
                }, this);

                fieldsData = fieldsData.filter(function (n) { return !!n });
                return fieldsData;
            },

            saveForm: function (saveOptions) {
                var items = this.getFieldsData();

                if (!this.FormModel.parentId) {
                    this.FormModel.parentId = this.FormsRootFolder;
                }

                var formModelCopy = $.extend(true, {}, this.FormModel);
                if (saveOptions.hasOwnProperty("formName")) {
                    formModelCopy.model.name = saveOptions.formName;
                }

                if (saveOptions.hasOwnProperty("isTemplate")) {
                    formModelCopy.model.isTemplate = saveOptions.isTemplate;
                }

                items.unshift(formModelCopy);

                items.forEach(function (item) {
                    item.model = JSON.stringify(item.model);
                });

                return formServices.saveForm(items, saveOptions.formMode || this.FormMode, this.CurrentLanguage);
            }
        });
    }, "FormDesignBoard");
})(Sitecore.Speak);