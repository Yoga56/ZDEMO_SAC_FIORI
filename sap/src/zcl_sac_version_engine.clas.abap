"! Version life cycle on the plan facts (the ABAP twin of VersionEngine.js):
"! private versions are copies, publish replaces a public version, revert copies the source again.
CLASS zcl_sac_version_engine DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_result,
             ok      TYPE abap_bool,
             count   TYPE i,
             message TYPE string,
           END OF ty_result.

    "! PRIV1, PRIV2 ... the first one not used yet for the model
    CLASS-METHODS next_private_id
      IMPORTING model_id      TYPE zsac_version-model_id
      RETURNING VALUE(result) TYPE zsac_version-version_id.

    CLASS-METHODS copy_version
      IMPORTING model_id     TYPE zsac_version-model_id
                from_version TYPE zsac_version-version_id
                to_version   TYPE zsac_version-version_id.

    CLASS-METHODS publish
      IMPORTING model_id      TYPE zsac_version-model_id
                source        TYPE zsac_version-version_id
                target        TYPE zsac_version-version_id
      RETURNING VALUE(result) TYPE ty_result.

    CLASS-METHODS revert
      IMPORTING model_id      TYPE zsac_version-model_id
                version       TYPE zsac_version-version_id
      RETURNING VALUE(result) TYPE ty_result.
ENDCLASS.


CLASS zcl_sac_version_engine IMPLEMENTATION.

  METHOD next_private_id.
    SELECT version_id FROM zsac_version WHERE model_id = @model_id INTO TABLE @DATA(used).
    DATA(n) = 1.
    WHILE line_exists( used[ version_id = |PRIV{ n }| ] ).
      n = n + 1.
    ENDWHILE.
    result = |PRIV{ n }|.
  ENDMETHOD.


  METHOD copy_version.
    zcl_sac_fact_writer=>replace( model_id   = model_id
                                  version_id = to_version
                                  new_facts  = zcl_sac_fact_writer=>read_version( model_id = model_id version_id = from_version ) ).
  ENDMETHOD.


  METHOD publish.
    SELECT SINGLE locked FROM zsac_version
      WHERE model_id = @model_id AND version_id = @target
      INTO @DATA(locked).
    IF sy-subrc <> 0.
      result-message = |Target version { target } does not exist|.
      RETURN.
    ENDIF.
    IF locked = abap_true.
      result-message = |Version { target } is locked|.
      RETURN.
    ENDIF.
    DATA(facts) = zcl_sac_fact_writer=>read_version( model_id = model_id version_id = source ).
    " data locking and validation look at what the publish changes in the target: new and changed values, and values that disappear
    DATA(current) = zcl_sac_fact_writer=>read_version( model_id = model_id version_id = target ).
    DATA changed TYPE zcl_sac_fact_writer=>ty_facts.
    DATA removed TYPE zcl_sac_fact_writer=>ty_facts.
    LOOP AT facts INTO DATA(new_fact).
      new_fact-version_id = target.
      READ TABLE current INTO DATA(old_fact) WITH KEY period = new_fact-period measure = new_fact-measure
        dim1 = new_fact-dim1 dim2 = new_fact-dim2 dim3 = new_fact-dim3 dim4 = new_fact-dim4 dim5 = new_fact-dim5.
      IF sy-subrc <> 0 OR old_fact-fact_value <> new_fact-fact_value.
        APPEND new_fact TO changed.
      ENDIF.
    ENDLOOP.
    LOOP AT current INTO old_fact.
      READ TABLE facts TRANSPORTING NO FIELDS WITH KEY period = old_fact-period measure = old_fact-measure
        dim1 = old_fact-dim1 dim2 = old_fact-dim2 dim3 = old_fact-dim3 dim4 = old_fact-dim4 dim5 = old_fact-dim5.
      IF sy-subrc <> 0.
        APPEND old_fact TO removed.
      ENDIF.
    ENDLOOP.
    DATA(refused) = zcl_sac_data_rules=>check( facts = changed deletes = removed ).
    IF refused IS NOT INITIAL.
      result-message = refused.
      RETURN.
    ENDIF.
    zcl_sac_fact_writer=>replace( model_id = model_id version_id = target new_facts = facts ).
    result = VALUE #( ok = abap_true count = lines( facts ) ).
  ENDMETHOD.


  METHOD revert.
    SELECT SINGLE source_version FROM zsac_version
      WHERE model_id = @model_id AND version_id = @version
      INTO @DATA(source).
    IF sy-subrc <> 0 OR source IS INITIAL.
      result-message = |Nothing to revert for { version }|.
      RETURN.
    ENDIF.
    copy_version( model_id = model_id from_version = source to_version = version ).
    result-ok = abap_true.
  ENDMETHOD.

ENDCLASS.
