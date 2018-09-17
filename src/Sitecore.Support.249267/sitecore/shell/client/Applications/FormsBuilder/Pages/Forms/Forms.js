(function(speak) {
    speak.pageCode([
            "itemJS", "/-/speak/v1/client/itemservice.js", "bclImageHelper",
            "/-/speak/v1/formsbuilder/assets/formservices.js"
        ],
        function(itemJS, ItemService, imageHelper, formServices) {
            var performanceTabGuid = "{9A4A7E57-5266-426A-93CE-85BDC0C95374}";
            var formDesignerUrl = "/sitecore/client/Applications/FormsBuilder/Pages/FormDesigner";
            var dateFormatter = speak.globalize.dateFormatter({ date: "medium" });

            var currentState = {
                ContextToggleIsOpen: ""
            };

            var tabIsSelectable = function(item) {
                return item && item["IsHidden"] !== "1" && item["IsDisabled"] !== "1";
            };

            return {
                initialized: function() {
                    this.on({
                            "forms:Add": this.addForm,
                            "forms:Edit": this.editForm,
                            "forms:Rename": this.renameForm,
                            "forms:Delete": this.deleteForm,
                            "forms:ExportData": this.exportFormData,
                            "formItemClick": this.formItemClick,
                            "DeleteConfirmationDialog:ButtonClick": this.confirmDeleteFormClicked,
                            "forms:ToggleSelection": this.toggleFormsSelection
                        },
                        this);

                    this.SortDropList.on("change:SelectedValues", this.setSortOption, this);

                    this.DeleteFormsSubAppRenderer.on("deleteforms:ProceedDelete", this.proceedDeleteForms, this);

                    this.DataSource.on("change:Items", this.dataSourceItemsChanged, this);
                    this.DataSource.on("change:IsBusy change:HasMoreData", this.updateListEndlessScroll, this);

                    this.ListControl.on("change:Items change:SelectedItem change:CheckedItems",
                        this.updateActionsState,
                        this);

                    this.InfoTabControl.isSelectable = tabIsSelectable;
                    this.InfoTabControl.on({
                            "loaded:Overview": function() {
                                this.fillOverviewTab(this.getSelectedItems(), this);
                            },
                            "loaded:Performance": function() {
                                this.fillPerformanceTab(this.getSelectedItems(), this);
                            },
                            "change:SelectedValue": this.tabsSwitched
                        },
                        this);
                    this.tabsSwitched();
                    this.ContextToggle.on("change:IsOpen", this.updatePerformanceAppIsActive, this);

                    this.SaveFormSubAppRenderer.on("saveform:NameChanged", this.renameFormNameChanged, this);

                    speak.on("sc-create-form-message", this.createForm, this);

                    var dropdownEl = this.ActionControl.el.querySelector('.dropdown-menu');
                    dropdownEl.classList.toggle("sc-placement-top", true);

                    this.SortDropList.el.removeAttribute("multiple");
                    this.setSortOption();
                },

                setSortOption: function() {
                    this.ListControl.Sorting = this.SortDropList.SelectedValues[0];
                    this.SortDropButton.Text = this.SortDropList.SelectedItems[0].Text;
                    $(this.SortDropButton.el).attr("title", this.SortDropButton.Text);
                    this.SortDropButton.IsOpen = false;
                },

                getSelectedItems: function() {
                    return this.ListControl.SelectedItem
                        ? [this.ListControl.SelectedItem]
                        : this.ListControl.CheckedItems;
                },

                updateActionsState: function() {
					
                    var hasItems = this.ListControl.Items && this.ListControl.Items.length;
                    var selectedItems = this.getSelectedItems();

                    this.ActionControl.getAction("Edit").IsDisabled = !(hasItems && selectedItems.length === 1);
                    this.ActionControl.getAction("Rename").IsDisabled = !(hasItems && selectedItems.length === 1);
                    this.ActionControl.getAction("ExportData").IsDisabled = !(hasItems && selectedItems.length === 1);
                    this.ActionControl.getAction("Delete").IsDisabled = !(hasItems && selectedItems.length);

                    var toggleSelection = this.ActionControl.getAction("ToggleSelection");
                    var isAllChecked = hasItems && this.ListControl.isAllChecked();
                    toggleSelection.Text = isAllChecked ? this.DeselectAll.Text : this.SelectAll.Text;
                    toggleSelection.Tooltip = isAllChecked ? this.DeselectAll.Tooltip : this.SelectAll.Tooltip;
                    toggleSelection.IsDisabled = !hasItems;

                    this.updateContextPane();
                },

                updateContextPane: function() {
                    var selectedItems = this.getSelectedItems();
                    var numberOfSelectedItems = selectedItems.length;
                    if (!numberOfSelectedItems) {
                        return;
                    }

                    this.ContextDetails.HeaderTitle = numberOfSelectedItems > 1
                        ? speak.Helpers.string.format(this.NumberOfFormsSelectedText.Text, numberOfSelectedItems)
                        : selectedItems[0].$displayName;

                    this.fillOverviewTab(selectedItems);
                    this.fillPerformanceTab(selectedItems);
                },

                updateListEndlessScroll: function() {
                    this.ListControl
                        .IsEndlessScrollEnabled = !this.DataSource.IsBusy && this.DataSource.HasMoreData;
                },
				

                dataSourceItemsChanged: function() {
                    if (this.DataSource.HasData) {
                        var options = {
                            sc_formmode: "edit"
                        };

                        //remove duplicates from serach results(versions of the same item). 249267                       
                        var list = [];
                        for (var i = 0; i < this.DataSource.Items.length; ++i) {
                            if (!list.find(function (element) {
                                return element.$itemId === this.$itemId;
                            }, this.DataSource.Items[i])) {
                                list.push(this.DataSource.Items[i]);
                            }
                        }

                        this.DataSource.off("change:Items", this.dataSourceItemsChanged, this);
                        this.DataSource.Items = list;
                        this.DataSource.on("change:Items", this.dataSourceItemsChanged, this);						

                        var baseUrl = speak.Helpers.url.addQueryParameters(formDesignerUrl, options);
                        this.DataSource.Items.forEach(function(item) {
                            item.$url = speak.Helpers.url.addQueryParameters(baseUrl, { formId: item.$itemId });
                        });
                    }

                    this.ListControl.DynamicData = this.DataSource.Items;

                    if (this.DataSource.HasMoreData && this.ListControl.IsEndlessScrollEnabled) {
                        setTimeout(function() {
                                if (!this.ListControl.HasScroll) {
                                    this.DataSource.next();
                                }
                            }.bind(this),
                            300);
                    }

                    if (this.ContextToggle.IsEnabled) {
                        currentState.ContextToggleIsOpen = this.ContextToggle.IsOpen;
                    }

                    this.ContextToggle.IsEnabled = this.DataSource.HasData;
                    this.ContextToggle.IsOpen = !this.DataSource.HasData ? false : currentState.ContextToggleIsOpen;
                },

                fillOverviewTab: function(selectedItems) {
                    var numberOfSelectedItems = selectedItems.length,
                        isSingleSelection = numberOfSelectedItems === 1,
                        imageContainer;

                    if (!this.OverviewApp || !numberOfSelectedItems) {
                        return;
                    }

                    this.OverviewApp.CheckingOverviewGridBorder.IsVisible = !isSingleSelection;
                    this.OverviewApp.OverviewGridBorder.IsVisible = isSingleSelection;
                    this.OverviewApp.LinksBorder.IsVisible = isSingleSelection;

                    for (var i = 0; i < 3; i++) {
                        imageContainer = this.OverviewApp["OverviewImage" + i];
                        if (numberOfSelectedItems > i) {
                            imageContainer.ImageUrl = this
                                .getImage(selectedItems[i].__Thumbnail,
                                    selectedItems[0]["$database"],
                                    imageContainer.Width,
                                    null);
                            imageContainer.IsVisible = true;
                        } else {
                            imageContainer.IsVisible = false;
                        }
                    }

                    if (numberOfSelectedItems > 3) {
                        this.OverviewApp.OverviewImage1.IsVisible = false;
                        this.OverviewApp.OverviewImage2.IsVisible = false;
                        this.OverviewApp.OverviewImage3.IsVisible = true;
                    } else {
                        this.OverviewApp.OverviewImage3.IsVisible = false;
                    }

                    if (isSingleSelection) {
                        this.OverviewApp.CreatedByValue.Text = selectedItems[0].__Createdby;

                        var isoDate = speak.utils.date.parseISO(selectedItems[0].__Created);
                        this.OverviewApp.CreatedDateValue.Text = isoDate ? dateFormatter(isoDate) : "";

                        isoDate = speak.utils.date.parseISO(selectedItems[0].__Updated);
                        this.OverviewApp.UpdatedDateValue.Text = isoDate ? dateFormatter(isoDate) : "";

                        formServices.getFormDetails(selectedItems[0].$itemId)
                            .then(this.populateLinksList.bind(this))
                            .fail(function() {
                                this.populateLinksList([]);
                            }.bind(this));

                    } else {
                        this.OverviewApp.CheckedFormsListControl.reset(selectedItems);
                    }
                },

                populateLinksList: function(links) {
                    this.OverviewApp.LinksListControl.IsSelectionRequired = false;
                    this.OverviewApp.LinksListControl.reset(links);
                    this.OverviewApp.LinksListControl.SelectedValue = "";
                },

                copyToClipboard: function() {
                    var clickedItem = this.OverviewApp.LinksListControl.ClickedItem;
                    if (!clickedItem) {
                        return;
                    }

                    this.OverviewApp.LinksListControl.IsSelectionRequired = true;

                    var $temp = $("<input>");
                    $("body").append($temp);
                    $temp.val(clickedItem.id).select();
                    document.execCommand("copy");
                    $temp.remove();

                    this.showCopiedMessage(this.OverviewApp.LinksListControl.Items.indexOf(clickedItem));
                },

                showCopiedMessage: function(clickedIndex) {
                    this.OverviewApp.LinksListControl.SelectedValue = "";

                    var $tags = $(this.OverviewApp.LinksListControl.el)
                        .find('.sc-listcontrol-tile .sc-linklist-copiedtag');
                    $tags.css('opacity', '0').text(this.OverviewApp.CopiedTagText.Text);
                    $tags.eq(clickedIndex).stop().fadeTo(100, 1).delay(2000).fadeTo(100, 0);
                },

                fillPerformanceTab: function(selectedItems) {
                    var isSingleSelection = selectedItems.length === 1,
                        performanceTab = this.InfoTabControl.getByValue(performanceTabGuid),
                        isTabEnabled = performanceTab.IsDisabled !== "1";

                    var shouldDisableTab = !isSingleSelection &&
                        (this.PerformanceApp ? this.PerformanceApp.FormPerformance.IsAnalyticsEnabled : true);
                    performanceTab.IsDisabled = shouldDisableTab ? "1" : "";

                    if (this.InfoTabControl.SelectedValue === performanceTabGuid &&
                        isTabEnabled &&
                        shouldDisableTab) {
                        this.InfoTabControl.select(this.InfoTabControl.getDefaultSelection());
                    }

                    if (!this.PerformanceApp)
                        return;

                    this.PerformanceApp.FormPerformance.FormId = isSingleSelection ? selectedItems[0].$itemId : "";
                    this.updatePerformanceAppIsActive();
                },

                getImage: function(imageValue, database, width, height) {
                    if (!imageValue || !database) {
                        return undefined;
                    }

                    var mediaid = imageHelper.getId(imageValue);
                    if (!mediaid) {
                        return undefined;
                    }

                    var url = "/sitecore/shell/~/media/" +
                        speak.Helpers.id.toShortId(mediaid) +
                        ".ashx?h=" +
                        height +
                        "&w=" +
                        width +
                        "&db=" +
                        database;
                    return url;
                },

                fillSubmissionColumnChart: function(columnCount) {
                    var chartDataSource = [];
                    var serie0 = {
                        key: 'Serie0',
                        values: []
                    };
                    for (var i = 0; i < columnCount; i++) {
                        serie0.values.push({
                            date: new Date(2016, 1, 1 + i),
                            submissions: 30 - i
                        });
                    }

                    chartDataSource.push(serie0);
                    this.OverviewApp.SubmissionColumnChart.DynamicData = chartDataSource;
                },

                formItemClick: function(data) {
                    //var item = data.sender.ClickedItem;
                    //window.location.href = formDesignerUrl + "?itemId=" + item.$itemId;
                },

                addForm: function() {
                },

                openFormDesigner: function(options) {
                    var url = speak.Helpers.url.addQueryParameters(formDesignerUrl, options);
                    window.location.href = url;
                },

                createForm: function(formId) {
                    var options = {
                    
                    };

                    if (formId && formId.length !== 0) {
                        options.formId = formId;
                        options.sc_formmode = "copy";
                    } else {
                        options.sc_formmode = "new";
                    }

                    this.openFormDesigner(options);
                },

                editForm: function() {
                    var selectedItems = this.getSelectedItems();
                    if (selectedItems.length !== 1)
                        return;

                    var itemId = selectedItems[0].$itemId;
                    if (itemId && itemId.length) {
                        var options = {
                            formId: itemId,
                            sc_formmode: "edit",
                            la: selectedItems[0].$language //pass language of the selected form 249267
                        };
                        this.openFormDesigner(options);
                    }
                },

                renameFormSuccess: function(renameOptions) {
                    this.removeOldMessage("RenameForm");

                    var dialogOptions = {
                        success: true
                    };

                    this.SaveFormSubAppRenderer.actionCompleted(dialogOptions);

                    this.MessageBar.add({
                        MessageId: "RenameForm",
                        Type: "notification",
                        Text: this.RenameFormSuccessMessage.Text,
                        IsClosable: true,
                        IsTemporary: true
                    });

                    this.renameOptions.form.$itemName = renameOptions.newName;
                    this.renameOptions.form.$displayName = renameOptions.newName;

                    this.ListControl.trigger("change:Items", this.ListControl.Items);
                    this.ListControl.trigger("itemsChanged", this.ListControl.Items);
                },

                renameFormError: function(response) {
                    this.removeOldMessage("RenameForm");

                    var messageText = response && response.responseJSON && response.responseJSON.message
                        ? response.responseJSON.message
                        : response.statusText;

                    var options = {
                        success: false,
                        message: messageText
                    };

                    this.SaveFormSubAppRenderer.actionCompleted(options);
                },

                renameFormNameChanged: function(newName) {
                    this.renameOptions.newName = newName;

                    formServices.renameForm(this.renameOptions.form.$itemId, newName)
                        .then(this.renameFormSuccess.bind(this, this.renameOptions))
                        .fail(this.renameFormError.bind(this));
                },

                renameForm: function() {
                    var selectedItems = this.getSelectedItems();
                    if (selectedItems.length !== 1) {
                        return;
                    }

                    var formItem = selectedItems[0];
                    this.renameOptions = { form: formItem };

                    this.SaveFormSubAppRenderer.show(formItem.$itemName, this.RenameDialogText.Text);
                },

                deleteForm: function() {
                    this.selectedItems = this.getSelectedItems();
                    var dialogText;

                    switch (this.selectedItems.length) {
                    case 0:
                        return;
                    case 1:
                        dialogText = this.DeleteSingleConfirmMessage.Text;
                        dialogText = speak.Helpers.string.format(dialogText, this.selectedItems[0].$displayName);
                        break;
                    default:
                        dialogText = this.DeleteMultipleConfirmMessage.Text;
                        dialogText = speak.Helpers.string.format(dialogText, this.selectedItems.length);
                        break;
                    }

                    this.DeleteConfirmationDialog.Message = dialogText;
                    this.DeleteConfirmationDialog.show();
                },

                confirmDeleteFormClicked: function(buttonControlId) {
                    if (buttonControlId[0] !== "ok")
                        return;

                    this.deleteForms(this.selectedItems);
                },

                proceedDeleteForms: function(items) {
                    this.deleteForms(items);
                },

                deleteForms: function(items) {
                    var itemIds = _.pluck(items, "$itemId");

                    if (!itemIds.length)
                        return;

                    formServices.deleteForms(itemIds)
                        .then(function(data, textStatus, xhr) {
                            this.deleteFormCompleted(xhr, items, true);
                        }.bind(this))
                        .fail(function(xhr) {
                            this.deleteFormCompleted(xhr, items, false);
                        }.bind(this));
                },

                deleteFormCompleted: function(xhr, items, isSuccess) {
                    var messageId = "DeleteForm";
                    this.removeOldMessage(messageId);

                    var deleteStatus;
                    try {
                        deleteStatus = xhr.responseJSON || JSON.parse(xhr.responseText);
                    } catch (e) {
                        deleteStatus = xhr.responseText;
                    }

                    var hasDeletedItems = false;
                    if (deleteStatus && typeof deleteStatus === "object") {
                        var itemStatusValues = _.values(deleteStatus);

                        var deleteComplete = itemStatusValues.every(function(value) {
                            return value === "deleted";
                        });

                        hasDeletedItems = itemStatusValues.length && deleteComplete;

                        if (!deleteComplete) {
                            var options = {
                                items: items,
                                itemsStatus: deleteStatus
                            };
                            this.DeleteFormsSubAppRenderer.show(options);
                            return;
                        }
                    }

                    // deletion is complete
                    setTimeout(function() {
                            this.DataSource.loadData();
                            this.CreateSubAppRenderer.CreateFormDataSource.loadData();
                        }.bind(this),
                        500);

                    if (hasDeletedItems && isSuccess) {
                        this.MessageBar.add({
                            MessageId: messageId,
                            Type: "notification",
                            Text: this.DeleteSuccessText.Text,
                            IsClosable: true
                        });
                    } else {
                        // show general error
                        this.MessageBar.add({
                            MessageId: messageId,
                            Type: "error",
                            Text: this.DeleteErrorText.Text,
                            IsClosable: false
                        });
                    }
                },

                exportFormData: function(e) {
                    var options;
                    if (e && e.exportOptions) {
                        options = e.exportOptions;
                    } else {
                        var selectedItems = this.getSelectedItems();
                        if (selectedItems.length !== 1) {
                            return;
                        }

                        options = {
                            formId: selectedItems[0].$itemId
                        };
                    }

                    this.ExportDataSubAppRenderer.show(options);
                },

                toggleFormsSelection: function() {
                    this.ListControl.toggleAll();
                },

                removeOldMessage: function(messageId) {
                    var oldMessages = this.MessageBar.where({ MessageId: messageId });
                    oldMessages.forEach(function(message) {
                            this.MessageBar.remove(message);
                        },
                        this);
                },

                updatePerformanceAppIsActive: function() {
                    if (this.PerformanceApp) {
                        this.PerformanceApp.FormPerformance
                            .IsActive = this.ContextToggle.IsOpen &&
                            this.InfoTabControl.SelectedValue === performanceTabGuid;
                    }
                },

                tabsSwitched: function() {
                    this.updatePerformanceAppIsActive();
                }
            };
        });
})(Sitecore.Speak);