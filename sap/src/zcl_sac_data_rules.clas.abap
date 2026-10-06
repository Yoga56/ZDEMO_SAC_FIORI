"! Data locking and validation rules on the server (the ABAP twin of LockEngine.js and ValidationEngine.js).
"! Called by the actions that write plan facts (WriteFacts, DeleteFacts, Publish), so a client that does not use zsac.lib is held to the same rules.
"!
"! The client stores the rules with the model: ZSAC_MODEL-LOCK_JSON and VALID_JSON are {"regions": [...], "srv": [...]} and
"! {"rules": [...], "srv": [...]}. The part under "srv" is for this class: lower case names, and every slice already expanded
"! to the members it covers (hierarchy nodes, quarters and years resolved by the client when the model is saved), so no hierarchy
"! is read here. Rules saved by an older client (a plain list) have no "srv" part and are not enforced here.
CLASS zcl_sac_data_rules DEFINITION PUBLIC FINAL CREATE PRIVATE.

  PUBLIC SECTION.
    "! The first reason the user may not write `facts` and delete `deletes`, or empty when it is fine.
    "! Private versions, and values that do not change what is stored, are not checked.
    CLASS-METHODS violation
      IMPORTING facts          TYPE zcl_sac_fact_writer=>ty_facts
                deletes        TYPE zcl_sac_fact_writer=>ty_facts OPTIONAL
      RETURNING VALUE(result) TYPE string.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_slice,
             fname   TYPE string,
             members TYPE string_table,
           END OF ty_slice,
           ty_slices TYPE STANDARD TABLE OF ty_slice WITH EMPTY KEY,
           BEGIN OF ty_region,
             id     TYPE string,
             name   TYPE string,
             state  TYPE string,
             owners TYPE string_table,
             slices TYPE ty_slices,
           END OF ty_region,
           ty_regions TYPE STANDARD TABLE OF ty_region WITH EMPTY KEY,
           BEGIN OF ty_lock_doc,
             srv TYPE ty_regions,
           END OF ty_lock_doc,
           BEGIN OF ty_rule,
             id      TYPE string,
             name    TYPE string,
             measure TYPE string,
             level   TYPE string,
             message TYPE string,
             min_value TYPE string,
             max_value TYPE string,
             slices  TYPE ty_slices,
           END OF ty_rule,
           ty_rules TYPE STANDARD TABLE OF ty_rule WITH EMPTY KEY,
           BEGIN OF ty_valid_doc,
             srv TYPE ty_rules,
           END OF ty_valid_doc.

    CLASS-METHODS in_slices
      IMPORTING fact          TYPE zcl_sac_fact_writer=>ty_fact
                slices        TYPE ty_slices
      RETURNING VALUE(result) TYPE abap_boolean.

    CLASS-METHODS field_value
      IMPORTING fact          TYPE zcl_sac_fact_writer=>ty_fact
                fname         TYPE string
      RETURNING VALUE(result) TYPE string.

    "! empty when the user may write the fact
    CLASS-METHODS lock_message
      IMPORTING fact          TYPE zcl_sac_fact_writer=>ty_fact
                regions       TYPE ty_regions
                default_state TYPE string
                uname         TYPE string
      RETURNING VALUE(result) TYPE string.
ENDCLASS.


CLASS zcl_sac_data_rules IMPLEMENTATION.

  METHOD field_value.
    CASE fname.
      WHEN 'period'.     result = fact-period.
      WHEN 'version_id'. result = fact-version_id.
      WHEN 'measure'.    result = fact-measure.
      WHEN 'dim1'.       result = fact-dim1.
      WHEN 'dim2'.       result = fact-dim2.
      WHEN 'dim3'.       result = fact-dim3.
      WHEN 'dim4'.       result = fact-dim4.
      WHEN 'dim5'.       result = fact-dim5.
    ENDCASE.
  ENDMETHOD.


  METHOD in_slices.
    result = abap_true.
    LOOP AT slices INTO DATA(slice).
      IF NOT line_exists( slice-members[ table_line = field_value( fact = fact fname = slice-fname ) ] ).
        result = abap_false.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD lock_message.
    DATA hits TYPE ty_regions.
    LOOP AT regions INTO DATA(region).
      IF in_slices( fact = fact slices = region-slices ) = abap_true.
        APPEND region TO hits.
      ENDIF.
    ENDLOOP.
    IF hits IS INITIAL.
      IF default_state = 'LOCKED'.
        result = |{ fact-period } is locked (the default of the model)|.
      ENDIF.
      RETURN.
    ENDIF.
    LOOP AT hits INTO DATA(hit) WHERE state = 'LOCKED'.
      result = |{ fact-period } is locked by region { hit-name }|.
      RETURN.
    ENDLOOP.
    LOOP AT hits INTO hit WHERE state = 'RESTRICTED'.
      IF NOT line_exists( hit-owners[ table_line = uname ] ) AND NOT line_exists( hit-owners[ table_line = `*` ] ).
        result = |{ fact-period } is restricted by region { hit-name } to its owners|.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD violation.
    DATA models TYPE SORTED TABLE OF zsac_fact-model_id WITH UNIQUE KEY table_line.
    LOOP AT facts INTO DATA(f).
      INSERT f-model_id INTO TABLE models.
    ENDLOOP.
    LOOP AT deletes INTO f.
      INSERT f-model_id INTO TABLE models.
    ENDLOOP.

    DATA(uname) = CONV string( zcl_sac_access=>user( ) ).

    LOOP AT models INTO DATA(current_model).
      SELECT SINGLE data_locking, lock_default, lock_json, valid_json FROM zsac_model
        WHERE model_id = @current_model INTO @DATA(model).
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      DATA lock_doc TYPE ty_lock_doc.
      DATA valid_doc TYPE ty_valid_doc.
      CLEAR: lock_doc, valid_doc.
      IF model-data_locking = abap_true AND model-lock_json IS NOT INITIAL.
        TRY.
            xco_cp_json=>data->from_string( model-lock_json )->write_to( REF #( lock_doc ) ).
          CATCH cx_root.
            CLEAR lock_doc.
        ENDTRY.
      ENDIF.
      IF model-valid_json IS NOT INITIAL.
        TRY.
            xco_cp_json=>data->from_string( model-valid_json )->write_to( REF #( valid_doc ) ).
          CATCH cx_root.
            CLEAR valid_doc.
        ENDTRY.
      ENDIF.
      IF model-data_locking = abap_false AND valid_doc-srv IS INITIAL.
        CONTINUE.
      ENDIF.
      IF model-data_locking = abap_true AND lock_doc-srv IS INITIAL AND model-lock_default <> 'LOCKED' AND valid_doc-srv IS INITIAL.
        CONTINUE.
      ENDIF.

      SELECT version_id FROM zsac_version WHERE model_id = @current_model AND category = 'PRIVATE' INTO TABLE @DATA(private_versions).
      DATA(stored) = zcl_sac_fact_writer=>read_model( current_model ).
      DATA stored_by_key TYPE zcl_sac_fact_writer=>ty_work.
      CLEAR stored_by_key.
      stored_by_key = CORRESPONDING #( stored ).

      LOOP AT facts INTO f WHERE model_id = current_model.
        IF line_exists( private_versions[ version_id = f-version_id ] ).
          CONTINUE.
        ENDIF.
        ASSIGN stored_by_key[ model_id = f-model_id version_id = f-version_id period = f-period measure = f-measure
                              dim1 = f-dim1 dim2 = f-dim2 dim3 = f-dim3 dim4 = f-dim4 dim5 = f-dim5 ] TO FIELD-SYMBOL(<old>).
        IF <old> IS ASSIGNED AND <old>-fact_value = f-fact_value.
          UNASSIGN <old>.
          CONTINUE.
        ENDIF.
        IF <old> IS ASSIGNED.
          UNASSIGN <old>.
        ENDIF.
        IF model-data_locking = abap_true.
          DATA(locked) = lock_message( fact = f regions = lock_doc-srv default_state = CONV #( model-lock_default ) uname = uname ).
          IF locked IS NOT INITIAL.
            result = |Data locking stops this change: { locked }.|.
            RETURN.
          ENDIF.
        ENDIF.
        LOOP AT valid_doc-srv INTO DATA(rule) WHERE level = 'ERROR'.
          IF rule-measure IS NOT INITIAL AND rule-measure <> f-measure.
            CONTINUE.
          ENDIF.
          IF in_slices( fact = f slices = rule-slices ) = abap_false.
            CONTINUE.
          ENDIF.
          IF rule-min_value IS NOT INITIAL AND f-fact_value < CONV decfloat34( rule-min_value ).
            result = |Validation stops this change: { COND string( WHEN rule-message IS NOT INITIAL THEN rule-message ELSE rule-name ) }: { f-fact_value } is below the minimum { rule-min_value }.|.
            RETURN.
          ENDIF.
          IF rule-max_value IS NOT INITIAL AND f-fact_value > CONV decfloat34( rule-max_value ).
            result = |Validation stops this change: { COND string( WHEN rule-message IS NOT INITIAL THEN rule-message ELSE rule-name ) }: { f-fact_value } is above the maximum { rule-max_value }.|.
            RETURN.
          ENDIF.
        ENDLOOP.
      ENDLOOP.

      IF model-data_locking = abap_true.
        LOOP AT deletes INTO f WHERE model_id = current_model.
          IF line_exists( private_versions[ version_id = f-version_id ] ).
            CONTINUE.
          ENDIF.
          locked = lock_message( fact = f regions = lock_doc-srv default_state = CONV #( model-lock_default ) uname = uname ).
          IF locked IS NOT INITIAL.
            result = |Data locking stops this change: { locked }.|.
            RETURN.
          ENDIF.
        ENDLOOP.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
