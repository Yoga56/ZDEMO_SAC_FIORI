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
