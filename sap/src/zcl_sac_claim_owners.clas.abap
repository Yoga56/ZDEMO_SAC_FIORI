"! One-off: stories, models, data actions and multi actions saved before sharing existed have no owner, so they are open to everyone. This gives each of them to
"! the user who created it (the creation user of the row), which is what the owner would have been. Rows without a creation user
"! (the sample content of ZCL_SAC_SEED) stay open. Run with F9 in ADT; it is safe to run again.
CLASS zcl_sac_claim_owners DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

ENDCLASS.



CLASS zcl_sac_claim_owners IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    UPDATE zsac_story SET owner_id = created_by WHERE owner_id = @space AND created_by <> @space.
    DATA(stories) = sy-dbcnt.
    UPDATE zsac_model SET owner_id = created_by WHERE owner_id = @space AND created_by <> @space.
    DATA(models) = sy-dbcnt.
    UPDATE zsac_dataact SET owner_id = created_by WHERE owner_id = @space AND created_by <> @space.
    DATA(data_actions) = sy-dbcnt.
    UPDATE zsac_multiact SET owner_id = created_by WHERE owner_id = @space AND created_by <> @space.
    DATA(multi_actions) = sy-dbcnt.
    out->write( |{ stories } stories, { models } models, { data_actions } data actions and { multi_actions } multi actions now belong to the user who created them.| ).
  ENDMETHOD.

ENDCLASS.
